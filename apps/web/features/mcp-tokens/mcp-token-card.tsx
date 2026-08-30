import type { ReactNode } from "react";

import type { McpToken } from "@knowledgestack/api-contract/mcp-tokens";

import { Button } from "@/components/button";
import { formatTime } from "@/lib/format-time";

import styles from "./mcp-tokens.module.css";

/** One token: what the person called it, when a client last used it, when it expires, and Revoke. `armedId` names the token whose next click revokes it, and is null when nothing is armed. Revocation takes two clicks, because the client stops answering at once and the secret cannot come back. */
export function McpTokenCard({
  mcpToken,
  isBusy,
  armedId,
  onArm,
  onDelete,
}: {
  mcpToken: McpToken;
  isBusy: boolean;
  armedId: string | null;
  onArm: (id: string | null) => void;
  onDelete: () => void;
}): ReactNode {
  // formatTime measures how long ago a timestamp was, so an expiry in the future reads "just now" through it.
  const expiresAt = new Date(mcpToken.expiresAt);
  const hasExpired = expiresAt.getTime() <= Date.now();

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardName}>{mcpToken.name}</h2>
          <p className={styles.cardStats}>
            <span>last used {formatTime(mcpToken.lastUsedAt)}</span>
            <span className={hasExpired ? styles.expired : ""}>
              {hasExpired ? "expired" : `expires ${expiresAt.toLocaleDateString()}`}
            </span>
          </p>
        </div>
        <div className={styles.cardActions}>
          {armedId === mcpToken.id ? (
            <>
              <Button disabled={isBusy} onClick={onDelete}>
                Revoke for good
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(null)}>
                Keep
              </Button>
            </>
          ) : (
            <Button disabled={isBusy} onClick={() => onArm(mcpToken.id)}>
              Revoke
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
