import type { ReactNode } from "react";

import type { ReadConnectorStatusResponse, SourceProvider } from "@knowledgestack/shared/sources";

import { Button } from "@/components/button";

import styles from "./sources.module.css";

/** One card per provider the API can connect. `connectable` is false when the deployment set no client variables for that provider, and `detail` names the reason. */
export function ConnectorList({
  providers,
  isBusy,
  onConnect,
}: {
  providers: ReadConnectorStatusResponse["providers"];
  isBusy: boolean;
  onConnect: (provider: SourceProvider) => void;
}): ReactNode {
  return (
    <div className={styles.connectors}>
      {providers.map((provider) => (
        <article key={provider.provider} className={styles.connector}>
          <h2 className={styles.connectorName}>{provider.provider}</h2>
          {provider.connectable ? (
            <p className={styles.connectorDetail}>
              Grant access to the pages you want KnowledgeStack to read.
            </p>
          ) : null}
          <div className={styles.connectorAction}>
            <Button
              disabled={!provider.connectable || isBusy}
              aria-label={`Connect ${provider.provider}`}
              onClick={() => onConnect(provider.provider)}
            >
              Connect
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
