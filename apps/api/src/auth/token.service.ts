import { Injectable } from "@nestjs/common";
import "dotenv/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { SourceStatus } from "../generated/prisma/enums.js";
import type { SourceCredentialModel } from "../generated/prisma/models.js";

import { OAuthRequestError } from "./oauth.http.js";
import { OAuthRegistry } from "./oauth.registry.js";
import { isOAuthProvider, isRefreshableClient, type OAuthTokens } from "./oauth.types.js";

type RefreshResult =
  | { accessToken: string }
  | { reauthReason: string };

type PendingTokenRequest = {
  forceRefresh: boolean;
  promise: Promise<string>;
};

/**
 * Thrown when the stored grant can no longer produce an access token. The source row already carries status
 * reauth_required, so the caller stops the pass and leaves the row alone.
 */
class ReauthRequiredError extends Error {
  readonly reason: string;
  readonly documentSourceId: string;

  constructor(documentSourceId: string, reason: string) {
    super(`The document source ${documentSourceId} needs a new grant: ${reason}`);
    this.name = "ReauthRequiredError";
    this.reason = reason;
    this.documentSourceId = documentSourceId;
  }
}

@Injectable()
export class TokenService {
  private readonly decryptionKeys: Map<string, Buffer>;
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyId: string;
  private readonly oauthRegistry: OAuthRegistry;
  // One request per credential prevents two source rows from sending the same refresh token in this process.
  private readonly pendingTokenRequests = new Map<
    string,
    PendingTokenRequest
  >();
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService, oauthRegistry: OAuthRegistry) {
    const encodedEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encodedEncryptionKey) {
      throw new Error("TOKEN_ENCRYPTION_KEY is not set in the environment");
    }

    this.encryptionKey = this.decodeEncryptionKey(
      encodedEncryptionKey,
      "TOKEN_ENCRYPTION_KEY",
    );
    this.encryptionKeyId = this.buildEncryptionKeyId(this.encryptionKey);
    this.decryptionKeys = new Map([
      [this.encryptionKeyId, this.encryptionKey],
    ]);

    const encodedDecryptionKeys = process.env.TOKEN_DECRYPTION_KEYS;
    if (encodedDecryptionKeys) {
      for (const [keyIndex, encodedDecryptionKey] of encodedDecryptionKeys
        .split(",")
        .entries()) {
        const decryptionKey = this.decodeEncryptionKey(
          encodedDecryptionKey,
          `TOKEN_DECRYPTION_KEYS entry ${keyIndex + 1}`,
        );
        this.decryptionKeys.set(
          this.buildEncryptionKeyId(decryptionKey),
          decryptionKey,
        );
      }
    }

    this.oauthRegistry = oauthRegistry;
    this.prisma = prisma;
  }

  private decodeEncryptionKey(encodedKey: string, name: string): Buffer {
    const encryptionKey = Buffer.from(encodedKey, "base64url");
    if (encryptionKey.byteLength !== 32) {
      throw new Error(
        `${name} must decode to 32 bytes for AES-256, but it decoded to ${encryptionKey.byteLength}`,
      );
    }

    return encryptionKey;
  }

  private buildEncryptionKeyId(encryptionKey: Buffer): string {
    return createHash("sha256").update(encryptionKey).digest("base64url");
  }

  /**
   * Encrypt an OAuth token for a SourceCredential column. Returns "v1.keyId.iv.authTag.ciphertext". Each
   * binary part uses base64url. Never write the return value to a log.
   */
  encrypt(plaintext: string): string {
    // A fresh initialization vector per call is required: reusing one under the same key breaks AES-GCM confidentiality.
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      initializationVector,
    );
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return [
      "v1",
      this.encryptionKeyId,
      initializationVector,
      cipher.getAuthTag(),
      ciphertext,
    ]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  /**
   * Decrypt a value that encrypt() produced. Throws when the key is wrong or a stored byte changed, because
   * the authentication tag then fails to verify.
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(".");
    if (parts.length === 3) {
      for (const decryptionKey of this.decryptionKeys.values()) {
        try {
          return this.decryptTokenParts(parts, decryptionKey);
        } catch {
          continue;
        }
      }
      throw new Error("No decryption key can decrypt the legacy token");
    }
    if (parts.length !== 5 || parts[0] !== "v1" || !parts[1]) {
      throw new Error(
        "An encrypted token must have the format v1.keyId.iv.authTag.ciphertext",
      );
    }

    const decryptionKey = this.decryptionKeys.get(parts[1]);
    if (decryptionKey === undefined) {
      throw new Error(`No decryption key matches the key id ${parts[1]}`);
    }

    return this.decryptTokenParts(parts.slice(2), decryptionKey);
  }

  private decryptTokenParts(parts: string[], decryptionKey: Buffer): string {
    const [initializationVector, authenticationTag, ciphertext] = parts.map(
      (part) => Buffer.from(part, "base64url"),
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decryptionKey,
      initializationVector,
    );
    decipher.setAuthTag(authenticationTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }

  /**
   * Return a plaintext access token for a document source, and refresh it first when it expires within a
   * minute. A refresh writes the rotated credential back to the row. Never log or store the return value.
   * Throws ReauthRequiredError once the row carries status reauth_required, and TypeError when the source
   * holds no credential.
   */
  async getAccessToken(documentSourceId: string): Promise<string> {
    return this.requestAccessToken(documentSourceId, false);
  }

  /** Refresh the credential even when the provider returns no expiry time. */
  async refreshAccessToken(documentSourceId: string): Promise<string> {
    return this.requestAccessToken(documentSourceId, true);
  }

  private async requestAccessToken(
    documentSourceId: string,
    forceRefresh: boolean,
  ): Promise<string> {
    const documentSource = await this.prisma.documentSource.findUniqueOrThrow({
      where: { id: documentSourceId },
      select: {
        credential: {
          // PrismaService omits both token columns globally, so this query re-enables them.
          omit: { encryptedAccessToken: false, encryptedRefreshToken: false },
        },
      },
    });
    if (documentSource.credential === null) {
      throw new TypeError(
        `The document source ${documentSourceId} holds no credential.`,
      );
    }

    const credentialId = documentSource.credential.id;
    const pendingRequest = this.pendingTokenRequests.get(credentialId);
    if (pendingRequest !== undefined) {
      try {
        const accessToken = await pendingRequest.promise;
        if (forceRefresh && !pendingRequest.forceRefresh) {
          return this.requestAccessToken(documentSourceId, true);
        }
        return accessToken;
      } catch (error) {
        if (error instanceof ReauthRequiredError) {
          throw new ReauthRequiredError(documentSourceId, error.reason);
        }
        throw error;
      }
    }

    // No await can separate this call from the set below, or two callers each start a refresh.
    const tokenRequest = this.resolveAccessToken(
      documentSourceId,
      documentSource.credential,
      forceRefresh,
    ).finally(() => {
      this.pendingTokenRequests.delete(credentialId);
    });
    this.pendingTokenRequests.set(credentialId, {
      forceRefresh,
      promise: tokenRequest,
    });

    return tokenRequest;
  }

  private async resolveAccessToken(
    documentSourceId: string,
    credential: SourceCredentialModel,
    forceRefresh: boolean,
  ): Promise<string> {
    if (credential.status === SourceStatus.reauth_required) {
      throw new ReauthRequiredError(
        documentSourceId,
        "the credential needs a new grant",
      );
    }

    // expiresAt is null when the provider returns no expiry time, as Notion does.
    const eagerRefreshThresholdMilliseconds = 60_000;
    if (
      !forceRefresh &&
      (credential.expiresAt === null ||
        credential.expiresAt.getTime() - Date.now() >
          eagerRefreshThresholdMilliseconds)
    ) {
      return this.decrypt(credential.encryptedAccessToken);
    }

    return this.refreshCredentialAccessToken(
      documentSourceId,
      credential.id,
      forceRefresh,
    );
  }

  /**
   * Refresh one credential while a row lock blocks refresh requests from other API processes. The second
   * process reads the new token after it gets the lock.
   */
  private async refreshCredentialAccessToken(
    documentSourceId: string,
    credentialId: string,
    forceRefresh: boolean,
  ): Promise<string> {
    const refreshResult = await this.prisma.$transaction(
      async (transaction): Promise<RefreshResult> => {
        await transaction.$queryRaw`
          SELECT "id"
          FROM "source_credentials"
          WHERE "id" = ${credentialId}
          FOR UPDATE
        `;
        const credential = await transaction.sourceCredential.findUniqueOrThrow({
          where: { id: credentialId },
          omit: {
            encryptedAccessToken: false,
            encryptedRefreshToken: false,
          },
        });

        if (credential.status === SourceStatus.reauth_required) {
          return { reauthReason: "the credential needs a new grant" };
        }

        const eagerRefreshThresholdMilliseconds = 60_000;
        if (
          !forceRefresh &&
          (credential.expiresAt === null ||
            credential.expiresAt.getTime() - Date.now() >
              eagerRefreshThresholdMilliseconds)
        ) {
          return {
            accessToken: this.decrypt(credential.encryptedAccessToken),
          };
        }

        if (!isOAuthProvider(credential.provider)) {
          throw new TypeError(
            `The document source ${documentSourceId} holds no OAuth grant.`,
          );
        }
        if (credential.encryptedRefreshToken === null) {
          await this.markReauthRequired(transaction, credentialId);
          return { reauthReason: "the credential holds no refresh token" };
        }

        const client = this.oauthRegistry.createClient(credential.provider);
        if (!isRefreshableClient(client)) {
          await this.markReauthRequired(transaction, credentialId);
          return {
            reauthReason: `${credential.provider} issues no refresh token`,
          };
        }

        let tokens: OAuthTokens;
        try {
          tokens = await client.refreshTokens(
            this.decrypt(credential.encryptedRefreshToken),
          );
        } catch (error) {
          if (
            error instanceof OAuthRequestError &&
            error.errorCode === "invalid_grant"
          ) {
            await this.markReauthRequired(transaction, credentialId);
            return { reauthReason: error.message };
          }

          throw error;
        }

        await transaction.sourceCredential.update({
          where: { id: credentialId },
          data: {
            encryptedAccessToken: this.encrypt(tokens.accessToken),
            encryptedRefreshToken:
              tokens.refreshToken === null
                ? credential.encryptedRefreshToken
                : this.encrypt(tokens.refreshToken),
            expiresAt: tokens.expiresAt,
            scope: tokens.scope ?? credential.scope,
            status: SourceStatus.active,
          },
        });

        return { accessToken: tokens.accessToken };
      },
      { timeout: 15_000 },
    );

    if ("reauthReason" in refreshResult) {
      throw new ReauthRequiredError(
        documentSourceId,
        refreshResult.reauthReason,
      );
    }

    return refreshResult.accessToken;
  }

  private async markReauthRequired(
    transaction: Prisma.TransactionClient,
    credentialId: string,
  ): Promise<void> {
    await transaction.sourceCredential.update({
      where: { id: credentialId },
      data: { status: SourceStatus.reauth_required },
    });
    await transaction.documentSource.updateMany({
      where: { credentialId },
      data: { status: SourceStatus.reauth_required },
    });
  }
}
