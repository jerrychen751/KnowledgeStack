import { SourceProvider } from "../generated/prisma/enums.js";

// The providers that authenticate through OAuth. The filesystem connector reads a local path and holds no credential.
export type OAuthProviderName =
  | typeof SourceProvider.confluence
  | typeof SourceProvider.notion;

/** The token values that a provider returns. expiresAt stays null when the provider returns no expiry time. */
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

type OAuthCredentialIdentity = {
  externalId: string;
  externalDisplayName: string;
  externalUserId: string | null;
  externalUserEmail: string | null;
};

type OAuthResource = {
  externalId: string;
  externalSpaceId: string | null;
  externalDisplayName: string;
  config: Record<string, unknown>;
};

/** One authorization code exchange, split between one credential and every resource that the grant covers. */
export type OAuthGrant = {
  tokens: OAuthTokens;
  credential: OAuthCredentialIdentity;
  resources: OAuthResource[];
};

export type OAuthClientOptions = {
  clientId: string;
  clientSecret: string;
  // The exact string the provider console registers; the token endpoint rejects a value it did not see at the authorize step.
  redirectUri: string;
};

export interface OAuthClient {
  buildAuthorizationUrl(state: string): URL;
  exchangeAuthorizationCode(code: string): Promise<OAuthGrant>;
}

export interface RefreshableOAuthClient extends OAuthClient {
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
}

export function isOAuthProvider(
  provider: SourceProvider,
): provider is OAuthProviderName {
  return (
    provider === SourceProvider.confluence ||
    provider === SourceProvider.notion
  );
}

export function isRefreshableClient(
  client: OAuthClient,
): client is RefreshableOAuthClient {
  return "refreshTokens" in client;
}
