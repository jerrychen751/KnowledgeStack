import { fetchOAuthJson, fetchOAuthResponse } from "./oauth.http.js";
import type {
  OAuthClientOptions,
  OAuthGrant,
  OAuthTokens,
  RefreshableOAuthClient,
} from "./oauth.types.js";

type AtlassianTokenResponse = {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
};

type AtlassianSite = {
  id: string; // the cloudId that ConfluenceConnector puts in its API path
  name: string;
  scopes: string[];
  url: string;
};

type AtlassianAccount = {
  account_id: string;
  email?: string;
  name?: string;
};

type AtlassianSpace = {
  id: string;
  key: string;
  name: string;
};

type AtlassianSpaceResponse = {
  results: AtlassianSpace[];
  _links?: { next?: string };
};

function findNextUrl(body: AtlassianSpaceResponse, response: Response): string | null {
  if (body._links?.next !== undefined) {
    return body._links.next;
  }

  const linkHeader = response.headers.get("link");
  if (linkHeader === null) {
    return null;
  }

  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>;[^,]*rel="next"/);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return null;
}

export class ConfluenceOAuthClient implements RefreshableOAuthClient {
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

  /** Build the URL the user visits to grant access. The caller stores state and compares it in the callback route. */
  buildAuthorizationUrl(state: string): URL {
    const url = new URL("https://auth.atlassian.com/authorize");
    url.searchParams.set("audience", "api.atlassian.com");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set(
      "scope",
      "read:page:confluence read:space:confluence read:me offline_access",
    );
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    // Atlassian returns a refresh token only for a request that shows the consent screen.
    url.searchParams.set("prompt", "consent");

    return url;
  }

  async exchangeAuthorizationCode(code: string): Promise<OAuthGrant> {
    const token = await fetchOAuthJson<AtlassianTokenResponse>(
      this.fetchImplementation,
      "Atlassian",
      "exchange the authorization code",
      "https://auth.atlassian.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        }),
      },
    );
    if (!token.refresh_token) {
      throw new Error("Atlassian returned no refresh token for the new grant.");
    }

    const sites = (await this.listAccessibleSites(token.access_token)).filter(
      (site) => site.scopes.some((scope) => scope.includes("confluence")),
    );
    if (sites.length === 0) {
      throw new Error("The Atlassian grant covers no site.");
    }

    const account = await fetchOAuthJson<AtlassianAccount>(
      this.fetchImplementation,
      "Atlassian",
      "read the account",
      "https://api.atlassian.com/me",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
      },
    );

    const resources: OAuthGrant["resources"] = [];
    for (const site of sites) {
      for (const space of await this.listAccessibleSpaces(token.access_token, site.id)) {
        resources.push({
          externalId: site.id,
          externalSpaceId: space.id,
          externalDisplayName: `${space.name} (${space.key})`,
          config: { cloudId: site.id, siteUrl: site.url },
        });
      }
    }
    if (resources.length === 0) {
      throw new Error("The Atlassian grant covers no Confluence space.");
    }

    return {
      tokens: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scope: token.scope ?? null,
      },
      credential: {
        externalId: account.account_id,
        externalDisplayName:
          account.name ?? account.email ?? account.account_id,
        externalUserId: account.account_id,
        externalUserEmail: account.email ?? null,
      },
      resources,
    };
  }

  /** List every Atlassian site that the access token covers. The provider defines no array order. */
  async listAccessibleSites(accessToken: string): Promise<AtlassianSite[]> {
    return fetchOAuthJson<AtlassianSite[]>(
      this.fetchImplementation,
      "Atlassian",
      "list the accessible sites",
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  /** List the current, global Confluence spaces of one site that the user selected. A personal space and an archived one are left out, because a grant on a large site reaches one personal space per user and each space becomes a source to sync. */
  async listAccessibleSpaces(
    accessToken: string,
    cloudId: string,
  ): Promise<AtlassianSpace[]> {
    const apiBaseUrl = new URL(
      `/ex/confluence/${encodeURIComponent(cloudId)}/wiki/api/v2/`,
      "https://api.atlassian.com",
    );
    let nextUrl: URL | null = new URL("spaces?type=global&status=current", apiBaseUrl);
    const spaces: AtlassianSpace[] = [];

    while (nextUrl !== null) {
      const { body, response } = await fetchOAuthResponse<AtlassianSpaceResponse>(
        this.fetchImplementation,
        "Atlassian",
        "list the accessible spaces",
        nextUrl,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      spaces.push(...body.results);
      const nextLinkUrl = findNextUrl(body, response);
      if (nextLinkUrl === null) {
        nextUrl = null;
      } else {
        const nextLinkSearch = new URL(nextLinkUrl, apiBaseUrl).search;
        nextUrl = new URL("spaces", apiBaseUrl);
        nextUrl.search = nextLinkSearch;
      }
    }

    return spaces;
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const token = await fetchOAuthJson<AtlassianTokenResponse>(
      this.fetchImplementation,
      "Atlassian",
      "refresh the token",
      "https://auth.atlassian.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        }),
      },
    );
    if (!token.refresh_token) {
      throw new Error("Atlassian returned no rotated refresh token.");
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scope: token.scope ?? null,
    };
  }
}
