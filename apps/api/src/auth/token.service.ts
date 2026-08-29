import { Injectable } from "@nestjs/common";

import { EncryptionService } from "../encryption/encryption.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
  readonly sourceId: string;

  constructor(sourceId: string, reason: string) {
    super(`The source ${sourceId} needs a new grant: ${reason}`);
    this.name = "ReauthRequiredError";
    this.reason = reason;
    this.sourceId = sourceId;
  }
}

@Injectable()
export class TokenService {
  private readonly encryptionService: EncryptionService;
  private readonly oauthRegistry: OAuthRegistry;
  // One request per credential prevents two source rows from sending the same refresh token in this process.
  private readonly pendingTokenRequests = new Map<
    string,
    PendingTokenRequest
  >();
  private readonly prisma: PrismaService;

  constructor(
    prisma: PrismaService,
    oauthRegistry: OAuthRegistry,
    encryptionService: EncryptionService,
  ) {
    this.encryptionService = encryptionService;
    this.oauthRegistry = oauthRegistry;
    this.prisma = prisma;
  }

  /**
   * Return a plaintext access token for a source, and refresh it first when it expires within a
   * minute. A refresh writes the rotated credential back to the row. Never log or store the return value.
   * Throws ReauthRequiredError once the row carries status reauth_required, and TypeError when the source
   * holds no credential.
   */
  async getAccessToken(sourceId: string): Promise<string> {
    return this.requestAccessToken(sourceId, false);
  }

  /** Refresh the credential even when the provider returns no expiry time. */
  async refreshAccessToken(sourceId: string): Promise<string> {
    return this.requestAccessToken(sourceId, true);
  }

  private async requestAccessToken(
    sourceId: string,
    forceRefresh: boolean,
  ): Promise<string> {
    const source = await this.prisma.source.findUniqueOrThrow({
      where: { id: sourceId },
      select: {
        credential: {
          // PrismaService omits both token columns globally, so this query re-enables them.
          omit: { encryptedAccessToken: false, encryptedRefreshToken: false },
        },
      },
    });
    if (source.credential === null) {
      throw new TypeError(
        `The source ${sourceId} holds no credential.`,
      );
    }

    const credentialId = source.credential.id;
    const pendingRequest = this.pendingTokenRequests.get(credentialId);
    if (pendingRequest !== undefined) {
      try {
        const accessToken = await pendingRequest.promise;
        if (forceRefresh && !pendingRequest.forceRefresh) {
          return this.requestAccessToken(sourceId, true);
        }
        return accessToken;
      } catch (error) {
        if (error instanceof ReauthRequiredError) {
          throw new ReauthRequiredError(sourceId, error.reason);
        }
        throw error;
      }
    }

    // No await can separate this call from the set below, or two callers each start a refresh.
    const tokenRequest = this.resolveAccessToken(
      sourceId,
      source.credential,
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
    sourceId: string,
    credential: SourceCredentialModel,
    forceRefresh: boolean,
  ): Promise<string> {
    if (credential.status === SourceStatus.reauth_required) {
      throw new ReauthRequiredError(
        sourceId,
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
      try {
        return this.encryptionService.decrypt(credential.encryptedAccessToken);
      } catch {
        return this.refreshCredentialAccessToken(sourceId, credential.id, true);
      }
    }

    return this.refreshCredentialAccessToken(
      sourceId,
      credential.id,
      forceRefresh,
    );
  }

  /**
   * Refresh one credential while a row lock blocks refresh requests from other API processes. The second
   * process reads the new token after it gets the lock.
   */
  private async refreshCredentialAccessToken(
    sourceId: string,
    credentialId: string,
    forceRefresh: boolean,
  ): Promise<string> {
    const undecryptableTokenReason =
      "the stored token does not decrypt with the current TOKEN_ENCRYPTION_KEY";
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
          try {
            return { accessToken: this.encryptionService.decrypt(credential.encryptedAccessToken) };
          } catch {
            await this.markReauthRequired(transaction, credentialId);
            return { reauthReason: undecryptableTokenReason };
          }
        }

        if (!isOAuthProvider(credential.provider)) {
          throw new TypeError(
            `The source ${sourceId} holds no OAuth grant.`,
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

        let refreshToken: string;
        try {
          refreshToken = this.encryptionService.decrypt(credential.encryptedRefreshToken);
        } catch {
          await this.markReauthRequired(transaction, credentialId);
          return { reauthReason: undecryptableTokenReason };
        }

        let tokens: OAuthTokens;
        try {
          tokens = await client.refreshTokens(refreshToken);
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
            encryptedAccessToken: this.encryptionService.encrypt(tokens.accessToken),
            encryptedRefreshToken:
              tokens.refreshToken === null
                ? credential.encryptedRefreshToken
                : this.encryptionService.encrypt(tokens.refreshToken),
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
        sourceId,
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
    await transaction.source.updateMany({
      where: { credentialId },
      data: { status: SourceStatus.reauth_required },
    });
  }
}
