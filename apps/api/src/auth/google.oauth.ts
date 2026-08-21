import { fetchOAuthJson } from "./oauth.http.js";
import type { OAuthClientOptions } from "./oauth.types.js";

/** The Google account behind one sign-in. */
type GoogleIdentity = {
  externalId: string;
  externalEmail: string;
  externalDisplayName: string;
  externalImageUrl: string | null;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token: string;
};

// The OpenID Connect claims that the openid, email and profile scopes return.
type GoogleIdTokenClaims = {
  aud: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
  iss: string;
  name?: string;
  picture?: string;
  sub: string;
};

/**
 * The Google sign-in client. It identifies the person and stores no token, because KnowledgeStack calls no
 * Google API after the sign-in. A source keeps its own grant in SourceCredential instead.
 */
export class GoogleOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(options: OAuthClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
  }

  /** Build the URL where the person picks a Google account. The caller stores state and compares it in the callback route. */
  buildAuthorizationUrl(state: string): URL {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    // A sign-in needs no refresh token, and online skips the offline consent screen.
    url.searchParams.set("access_type", "online");
    // Without this, a browser holding one Google session signs that account in and never shows the picker.
    url.searchParams.set("prompt", "select_account");

    return url;
  }

  async exchangeAuthorizationCode(code: string): Promise<GoogleIdentity> {
    const token = await fetchOAuthJson<GoogleTokenResponse>(
      fetch,
      "Google",
      "exchange the authorization code",
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.redirectUri,
        }).toString(),
      },
    );

    return this.readIdentity(token.id_token);
  }

  /**
   * Read the account out of the id_token, a JWT of three base64url parts.
   *
   * This method checks the claims and not the signature: the token arrived over TLS from the Google token
   * endpoint, which Google states is enough. An id_token that reaches the API by any other route needs the
   * Google JWKS and a signature check first.
   */
  private readIdentity(idToken: string): GoogleIdentity {
    const payload = idToken.split(".")[1];
    if (payload === undefined) {
      throw new Error("Google returned an id_token that is not a JWT.");
    }

    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as GoogleIdTokenClaims;
    // Google issues both spellings of the issuer.
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
      throw new Error(`The id_token names the issuer ${claims.iss}, not Google.`);
    }
    if (claims.aud !== this.clientId) {
      throw new Error("The id_token was issued for another client id.");
    }
    if (claims.exp * 1000 <= Date.now()) {
      throw new Error("The id_token expired before the API read it.");
    }
    if (claims.email === undefined || claims.email_verified !== true) {
      throw new Error("The Google account carries no verified email address.");
    }

    return {
      externalId: claims.sub,
      externalEmail: claims.email,
      externalDisplayName: claims.name ?? claims.email,
      externalImageUrl: claims.picture ?? null,
    };
  }
}
