import { Injectable, LOG_LEVELS, type LogLevel } from "@nestjs/common";

/** Read and validate process-wide API configuration once during startup. */
@Injectable()
export class AppConfig {
  // Identifies this API deployment in startup logs with letters, numbers, periods, underscores, or hyphens. Defaults to "development".
  readonly deploymentName: string;
  readonly encryptionKey: Buffer;
  // Names the host where the API accepts connections, such as "0.0.0.0". Defaults to "127.0.0.1".
  readonly host: string;
  // Sets the minimum Nest log level, such as "warn". Defaults to "verbose".
  readonly logLevel: LogLevel;
  readonly openaiApiKey: string;
  // Sets the TCP port from 1 through 65535. Defaults to 3001.
  readonly port: number;
  // Sets the maximum JSON body size with a unit, such as "12mb". Defaults to "12mb".
  readonly requestBodyLimit: string;
  readonly googleRedirectUri: string;
  readonly sourceRedirectUri: string;
  // Accepts only an HTTP or HTTPS origin for browser redirects, such as "https://example.com". Defaults to "http://localhost:3000".
  readonly webAppUrl: string;

  constructor() {
    const deploymentName = process.env.DEPLOYMENT_NAME || "development";
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(deploymentName)) {
      throw new Error(
        "DEPLOYMENT_NAME must contain only letters, numbers, periods, underscores and hyphens.",
      );
    }
    this.deploymentName = deploymentName;

    const encodedEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encodedEncryptionKey) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be set.");
    }
    this.encryptionKey = Buffer.from(encodedEncryptionKey, "base64url");
    if (this.encryptionKey.byteLength !== 32) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY must decode to 32 bytes for AES-256, but it decoded to ${this.encryptionKey.byteLength}.`,
      );
    }

    this.host = process.env.HOST || "127.0.0.1";

    const logLevel = process.env.LOG_LEVEL || "verbose";
    if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
      throw new Error(
        `LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}.`,
      );
    }
    this.logLevel = logLevel as LogLevel;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY must be set.");
    }
    this.openaiApiKey = openaiApiKey;

    const port = Number(process.env.PORT || "3001");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("PORT must be an integer from 1 through 65535.");
    }
    this.port = port;

    const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "12mb";
    if (!/^[1-9]\d*(?:b|kb|mb|gb)$/i.test(requestBodyLimit)) {
      throw new Error(
        "REQUEST_BODY_LIMIT must use a positive integer and one unit: b, kb, mb or gb.",
      );
    }
    this.requestBodyLimit = requestBodyLimit;

    const configuredWebAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    let webAppUrl: URL;
    try {
      webAppUrl = new URL(configuredWebAppUrl);
    } catch {
      throw new Error("WEB_APP_URL must be a valid HTTP or HTTPS origin.");
    }
    if (
      (webAppUrl.protocol !== "http:" && webAppUrl.protocol !== "https:") ||
      webAppUrl.username !== "" ||
      webAppUrl.password !== "" ||
      webAppUrl.pathname !== "/" ||
      webAppUrl.search !== "" ||
      webAppUrl.hash !== ""
    ) {
      throw new Error("WEB_APP_URL must be a valid HTTP or HTTPS origin.");
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(webAppUrl.hostname) || webAppUrl.hostname.includes(":")) {
      throw new Error(
        "WEB_APP_URL must name a host, such as http://localhost:3000, because Notion refuses an IP address in a redirect URI.",
      );
    }
    this.webAppUrl = webAppUrl.origin;

    this.googleRedirectUri = `${this.webAppUrl}/api/auth/google/callback`;
    this.sourceRedirectUri = `${this.webAppUrl}/api/sources/oauth/callback`;
  }
}
