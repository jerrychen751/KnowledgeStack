import type { ReactNode } from "react";

import type {
  ReadConnectorStatusResponse,
  Source,
  SourceProvider,
} from "@knowledgestack/api-contract/sources";

import { Button } from "@/components/button";

import styles from "./sources.module.css";

/** One card per provider the API can connect. A provider that already owns a working source shows the count in place of the Connect button, because a second grant for the same provider would replace the first. A provider whose grant expired keeps the button, because a new grant is the only way back. `missingVariables` names each environment variable the deployment must set before the provider can connect, and disables the button while it holds a name. */
export function ConnectorList({
  providers,
  sources,
  isBusy,
  onConnect,
}: {
  providers: ReadConnectorStatusResponse["providers"];
  sources: Source[];
  isBusy: boolean;
  onConnect: (provider: SourceProvider) => void;
}): ReactNode {
  return (
    <div className={styles.connectors}>
      {providers.map((provider) => {
        const providerSources = sources.filter(
          (source) => source.provider === provider.provider,
        );
        const connectedCount = providerSources.length;
        const needsReauth = providerSources.some(
          (source) => source.status === "reauth_required",
        );
        return (
          <article key={provider.provider} className={styles.connector}>
            <div className={styles.connectorHead}>
              <h2 className={styles.connectorName}>{provider.provider}</h2>
              {connectedCount === 0 ? null : (
                <span className={styles.connectorConnected}>Connected</span>
              )}
            </div>
            <p className={styles.connectorDetail}>
              {needsReauth
                ? `The grant expired. Connect again to keep ${connectedCount === 1 ? "this source" : "these sources"} working.`
                : connectedCount > 0
                  ? `${connectedCount} ${connectedCount === 1 ? "source" : "sources"} above. Remove ${connectedCount === 1 ? "it" : "them"} to connect a different account.`
                  : provider.missingVariables.length > 0
                    ? `Set ${provider.missingVariables.join(" and ")} on the server.`
                    : "Grant access to the pages you want KnowledgeStack to read."}
            </p>
            {connectedCount > 0 && !needsReauth ? null : (
              <div className={styles.connectorAction}>
                <Button
                  disabled={provider.missingVariables.length > 0 || isBusy}
                  aria-label={`Connect ${provider.provider}`}
                  onClick={() => onConnect(provider.provider)}
                >
                  Connect
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
