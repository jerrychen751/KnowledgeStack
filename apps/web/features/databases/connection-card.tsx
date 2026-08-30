import type { ReactNode } from "react";

import type { DatabaseConnection } from "@knowledgestack/shared/database-connections";

import { Button } from "@/components/button";
import { Label } from "@/components/label";
import { formatTime } from "@/lib/format-time";

import styles from "./databases.module.css";

/** One registered database: where it is, what the last check reported, and the Test and Remove actions. `armedId` names the connection whose next click deletes it, and is null when nothing is armed. Removal takes two clicks, because the agent stops answering questions about that database at once. */
export function ConnectionCard({
  databaseConnection,
  isBusy,
  armedId,
  onArm,
  onTest,
  onDelete,
}: {
  databaseConnection: DatabaseConnection;
  isBusy: boolean;
  armedId: string | null;
  onArm: (id: string | null) => void;
  onTest: () => void;
  onDelete: () => void;
}): ReactNode {
  const isActive = databaseConnection.status === "active";

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <Label>{databaseConnection.engine}</Label>
          <h2 className={styles.cardName}>{databaseConnection.name}</h2>
          <p className={styles.cardDescription}>{databaseConnection.description}</p>
          <p className={styles.cardStats}>
            <span className={styles.dsn}>
              {databaseConnection.username}@{databaseConnection.host}:{databaseConnection.port}/
              {databaseConnection.database}
            </span>
            <span className={`${styles.status} ${isActive ? "" : styles.statusError}`}>
              <span className={styles.statusDot} />
              {isActive ? "active" : "unreachable"}
            </span>
            <span>checked {formatTime(databaseConnection.lastCheckedAt)}</span>
          </p>
        </div>
        <div className={styles.cardActions}>
          {armedId === databaseConnection.id ? (
            <>
              <p className={styles.confirm}>
                Remove this database? The agent stops answering questions about it.
              </p>
              <Button className={styles.confirmButton} disabled={isBusy} onClick={onDelete}>
                Delete
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button disabled={isBusy} onClick={onTest}>
                Test
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(databaseConnection.id)}>
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
