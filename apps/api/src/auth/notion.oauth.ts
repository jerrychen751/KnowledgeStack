import { fetchOAuthJson } from "./oauth.http.js";
import type {
  OAuthClientOptions,
  OAuthGrant,
  OAuthTokens,
  RefreshableOAuthClient,
} from "./oauth.types.js";

type NotionUser = {
  id: string;
  person?: { email?: string };
};

type NotionTokenResponse = {
  access_token: string;
  bot_id: string;
  refresh_token: string | null;
  workspace_id: string;
  workspace_name: string | null;
  // An internal integration answers with the workspace owner and names no user.
  owner:
    | { type: "user"; user: NotionUser }
    | { type: "workspace"; workspace: true };
};

export class NotionOAuthClient implements RefreshableOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly redirectUri: string;

  constructor(
    options: OAuthClientOptions,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImplementation = fetchImplementation;
    this.redirectUri = options.redirectUri;
  }

  /** Build the URL the user visits to pick the pages to share. The caller stores state and compares it in the callback route. */
  buildAuthorizationUrl(state: string): URL {
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("response_type", "code");
    // owner=user is required for a public integration, and Notion rejects the request without it.
    url.searchParams.set("owner", "user");
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);

    return url;
  }

  private buildTokenHeaders(): Record<string, string> {
    const authorization = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");
    return {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    };
  }

  async exchangeAuthorizationCode(code: string): Promise<OAuthGrant> {
    const token = await fetchOAuthJson<NotionTokenResponse>(
      this.fetchImplementation,
      "Notion",
      "exchange the authorization code",
      "https://api.notion.com/v1/oauth/token",
      {
        method: "POST",
        headers: this.buildTokenHeaders(),
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.redirectUri,
        }),
      },
    );
    if (!token.refresh_token) {
      throw new Error("Notion returned no refresh token for the new grant.");
    }

    const user = token.owner.type === "user" ? token.owner.user : null;

    return {
      tokens: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: null,
        scope: null,
      },
      credential: {
        externalId: token.bot_id,
        externalDisplayName: token.workspace_name ?? "Notion workspace",
        externalUserId: user?.id ?? null,
        externalUserEmail: user?.person?.email ?? null,
      },
      resources: [
        {
          externalId: token.workspace_id,
          externalSpaceId: null,
          externalDisplayName: token.workspace_name ?? "Notion workspace",
          config: { workspaceId: token.workspace_id },
        },
      ],
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const token = await fetchOAuthJson<NotionTokenResponse>(
      this.fetchImplementation,
      "Notion",
      "refresh the token",
      "https://api.notion.com/v1/oauth/token",
      {
        method: "POST",
        headers: this.buildTokenHeaders(),
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    if (!token.refresh_token) {
      throw new Error("Notion returned no rotated refresh token.");
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: null,
      scope: null,
    };
  }
}
