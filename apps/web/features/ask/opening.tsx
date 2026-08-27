import Link from "next/link";
import type { ReactNode } from "react";

import type { Source } from "@knowledgestack/shared/sources";

import { Label } from "@/components/label";

import styles from "./ask.module.css";

/** What the thread shows before the first question: the claim the product makes, and the sources a question can reach. `sources` is null until the list arrives, and a source with no document is left out because no question can reach it. */
export function Opening({ sources }: { sources: Source[] | null }): ReactNode {
  const indexedSources = (sources ?? []).filter((source) => source.documentCount > 0);

  return (
    <div className={styles.opening}>
      <h1 className={styles.openingThesis}>
        Ask a question about your documents.
        <span className={styles.openingClaim}>
          Every claim in the answer points back to the chunk it came from.
        </span>
      </h1>
      <div className={styles.indexed}>
        <Label as="p">{indexedSources.length === 0 ? "Nothing indexed" : "Indexed"}</Label>
        {indexedSources.length === 0 ? (
          <p className={styles.openingNote}>
            Add Markdown or text files on the <Link href="/sources">Sources</Link> page, then come
            back and ask.
          </p>
        ) : (
          <ul className={styles.indexedList}>
            {indexedSources.map((source) => (
              <li key={source.id} className={styles.indexedItem}>
                {source.externalDisplayName} · {source.documentCount}{" "}
                {source.documentCount === 1 ? "document" : "documents"} · {source.chunkCount}{" "}
                {source.chunkCount === 1 ? "chunk" : "chunks"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
