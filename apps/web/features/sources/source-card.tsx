import type { ReactNode } from "react";

import type { Source, SourceDocument } from "@knowledgestack/shared/sources";

import { Button } from "@/components/button";
import { Label } from "@/components/label";

import { DocumentRow } from "./document-row";
import { formatTime } from "@/lib/format-time";
import styles from "./sources.module.css";

/** One connected source: its counts, its last sync time, and the Sync and Remove actions. `armedId` names the source or the document whose next click deletes it, and is null when nothing is armed. Removal takes two clicks, because the API deletes every chunk of the source and cannot undo it. */
export function SourceCard({
  source,
  documents,
  isBusy,
  armedId,
  onArm,
  onSync,
  onDeleteSource,
  onDeleteDocument,
}: {
  source: Source;
  documents: SourceDocument[];
  isBusy: boolean;
  armedId: string | null;
  onArm: (id: string | null) => void;
  onSync: () => void;
  onDeleteSource: () => void;
  onDeleteDocument: (documentId: string) => void;
}): ReactNode {
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <Label>{source.provider}</Label>
          <h2 className={styles.cardName}>{source.externalDisplayName}</h2>
          <p className={styles.cardStats}>
            <span className={styles.cardStat}>
              <b>{source.documentCount}</b>{" "}
              {source.documentCount === 1 ? "document" : "documents"}
            </span>
            <span className={styles.cardStat}>
              <b>{source.chunkCount}</b> {source.chunkCount === 1 ? "chunk" : "chunks"}
            </span>
            <span className={styles.cardStat}>synced {formatTime(source.lastSyncedAt)}</span>
          </p>
        </div>
        <div className={styles.cardActions}>
          {armedId === source.id ? (
            <>
              <p className={styles.confirm}>
                {source.provider === "filesystem"
                  ? "Delete this source and every file uploaded to it?"
                  : `Remove this source? Your pages stay in ${source.provider}.`}
              </p>
              <Button
                className={styles.confirmButton}
                disabled={isBusy}
                onClick={onDeleteSource}
              >
                Delete
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button disabled={isBusy} onClick={onSync}>
                Sync
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(source.id)}>
                Remove
              </Button>
            </>
          )}
        </div>
      </div>

      {documents.length === 0 ? null : (
        <div
          className={`${styles.documents} ${
            source.provider === "filesystem" ? styles.documentsRemovable : ""
          }`}
        >
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              isRemovable={source.provider === "filesystem"}
              isArmed={armedId === document.id}
              isBusy={isBusy}
              onRemoveClick={() => {
                if (armedId !== document.id) {
                  onArm(document.id);
                  return;
                }

                onDeleteDocument(document.id);
              }}
            />
          ))}
        </div>
      )}
    </article>
  );
}
