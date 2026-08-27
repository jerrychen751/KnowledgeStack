import type { ReactNode } from "react";

import type { SourceDocument } from "@knowledgestack/shared/sources";

import { formatTime } from "./format-time";
import styles from "./sources.module.css";

/** One document of a source: its title, the number of chunks it produced, and the time the last index pass wrote them. A source the person uploaded shows a remove button, which reads "Delete" once `isArmed` is true. */
export function DocumentRow({
  document,
  isRemovable,
  isArmed,
  isBusy,
  onRemoveClick,
}: {
  document: SourceDocument;
  isRemovable: boolean;
  isArmed: boolean;
  isBusy: boolean;
  onRemoveClick: () => void;
}): ReactNode {
  return (
    <div className={styles.documentRow}>
      <span className={styles.documentName}>{document.externalTitle}</span>
      <span
        className={`${styles.documentMeta} ${
          document.chunkCount === 0 ? styles.documentSkipped : ""
        }`}
      >
        {document.documentType === "attachment"
          ? "not text"
          : `${document.chunkCount} ${document.chunkCount === 1 ? "chunk" : "chunks"}`}
      </span>
      <span className={`${styles.documentMeta} ${styles.documentTime}`}>
        {formatTime(document.lastIndexedAt)}
      </span>
      {isRemovable ? (
        <button
          type="button"
          className={`${styles.documentRemove} ${isArmed ? styles.documentRemoveArmed : ""}`}
          disabled={isBusy}
          aria-label={
            isArmed ? `Delete ${document.externalTitle}` : `Remove ${document.externalTitle}`
          }
          onClick={onRemoveClick}
        >
          {isArmed ? "Delete" : "Remove"}
        </button>
      ) : null}
    </div>
  );
}
