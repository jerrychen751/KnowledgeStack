import { Injectable } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { SourceProvider } from "../generated/prisma/enums.js";

import { ConfluenceOAuthClient } from "./confluence.oauth.js";
import { NotionOAuthClient } from "./notion.oauth.js";
import type { OAuthClient, OAuthClientOptions, OAuthProviderName } from "./oauth.types.js";

function findMissingClientVariables(variablePrefix: string): string[] {
  return [`${variablePrefix}_CLIENT_ID`, `${variablePrefix}_CLIENT_SECRET`].filter(
    (variableName) => !process.env[variableName],
  );
}

/** Read the OAuth client variables of one provider. The variable prefix is the provider name in capitals. `AppConfig` derives every redirect URI from `WEB_APP_URL`, so the caller passes `googleRedirectUri` or `sourceRedirectUri` and the environment holds no redirect variable. */
export function readClientOptions(
  variablePrefix: string,
  redirectUri: string | undefined,
): OAuthClientOptions {
  const clientId = process.env[`${variablePrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${variablePrefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    const missingVariables = findMissingClientVariables(variablePrefix);
    throw new Error(
      `${missingVariables.join(" and ")} ${missingVariables.length === 1 ? "is" : "are"} not set in the environment`,
    );
  }
  if (!redirectUri) {
    throw new Error(`${variablePrefix}_REDIRECT_URI is not set in the environment`);
  }

  return { clientId, clientSecret, redirectUri };
}

@Injectable()
export class OAuthRegistry {
  constructor(private readonly appConfig: AppConfig) {}

  /** Name every environment variable this provider needs and the deployment has not set. An empty array means the provider can connect. */
  findMissingVariables(provider: OAuthProviderName): string[] {
    return findMissingClientVariables(provider.toUpperCase());
  }

  /** Build the OAuth client of one provider. Throws when that provider's variables are absent, which a deployment without that connector never needs. */
  createClient(provider: OAuthProviderName): OAuthClient {
    const options = readClientOptions(
      provider.toUpperCase(),
      this.appConfig.sourceRedirectUri,
    );

    switch (provider) {
      case SourceProvider.confluence:
        return new ConfluenceOAuthClient(options);
      case SourceProvider.notion:
        return new NotionOAuthClient(options);
    }
  }
}
