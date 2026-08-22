import { Injectable } from "@nestjs/common";

import { SourceProvider } from "../generated/prisma/enums.js";

import { ConfluenceOAuthClient } from "./confluence.oauth.js";
import { NotionOAuthClient } from "./notion.oauth.js";
import type { OAuthClient, OAuthClientOptions, OAuthProviderName } from "./oauth.types.js";

// The variable prefix names the vendor, not the connector: one Atlassian app serves Confluence and Jira.
export function readClientOptions(variablePrefix: string): OAuthClientOptions {
  const clientId = process.env[`${variablePrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${variablePrefix}_CLIENT_SECRET`];
  const redirectUri = process.env[`${variablePrefix}_REDIRECT_URI`];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      `${variablePrefix}_CLIENT_ID, ${variablePrefix}_CLIENT_SECRET and ${variablePrefix}_REDIRECT_URI are not set in the environment`,
    );
  }

  return { clientId, clientSecret, redirectUri };
}

@Injectable()
export class OAuthRegistry {
  /** Build the OAuth client of one provider. Throws when that provider's variables are absent, which a deployment without that connector never needs. */
  createClient(provider: OAuthProviderName): OAuthClient {
    switch (provider) {
      case SourceProvider.confluence:
        return new ConfluenceOAuthClient(readClientOptions("ATLASSIAN"));
      case SourceProvider.notion:
        return new NotionOAuthClient(readClientOptions("NOTION"));
    }
  }
}
