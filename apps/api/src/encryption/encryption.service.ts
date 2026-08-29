import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { AppConfig } from "../config/app-config.js";

/**
 * AES-256-GCM over the one key the deployment sets in TOKEN_ENCRYPTION_KEY.
 *
 * Every secret this API writes to Postgres passes through here: the OAuth tokens of a source credential and
 * the password of a database connection.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly keyId: string;

  constructor(appConfig: AppConfig) {
    this.key = appConfig.encryptionKey;
    this.keyId = createHash("sha256")
      .update(this.key)
      .digest("base64url");
  }

  /**
   * Encrypt one secret for a database column. Returns "v1.keyId.iv.authTag.ciphertext". Each binary part
   * uses base64url. Never write the return value to a log.
   */
  encrypt(plaintext: string): string {
    // A fresh initialization vector per call is required: reusing one under the same key breaks AES-GCM confidentiality.
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.key,
      initializationVector,
    );
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return [
      "v1",
      this.keyId,
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
    if (parts.length !== 5 || parts[0] !== "v1") {
      throw new Error(
        "An encrypted value must have the format v1.keyId.iv.authTag.ciphertext",
      );
    }
    if (parts[1] !== this.keyId) {
      throw new Error(
        `The key id ${parts[1]} in the value does not match TOKEN_ENCRYPTION_KEY`,
      );
    }

    const [initializationVector, authenticationTag, ciphertext] = parts
      .slice(2)
      .map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      initializationVector,
    );
    decipher.setAuthTag(authenticationTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
