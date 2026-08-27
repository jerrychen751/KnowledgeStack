import { useEffect, useState, type ReactNode } from "react";

import { Label } from "@/components/label";

import styles from "./ask.module.css";
import type { Turn } from "./use-answer-stream";

/** The right rail of the ask page. It lists every chunk the searches of `turn` retrieved, dims the ones the answer did not cite, and opens the full chunk text on a click. `turn` is undefined before the first question. */
export function CitationRail({
  turn,
  activeTurnPosition,
  activeCitationIndex,
  onSelect,
}: {
  turn: Turn | undefined;
  activeTurnPosition: number;
  activeCitationIndex: number | null;
  onSelect: (index: number) => void;
}): ReactNode {
  const [openChunkIds, setOpenChunkIds] = useState<string[]>([]);

  useEffect(() => {
    if (activeCitationIndex !== null) {
      document
        .getElementById(`citation-${activeCitationIndex}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeCitationIndex, activeTurnPosition]);

  // The retrieval returns more chunks than the answer uses, so the rail marks the ones it cited.
  const citedIndexes = new Set(
    [...(turn?.answer ?? "").matchAll(/\[(\d+)\]/g)].map((marker) => Number(marker[1])),
  );

  return (
    <aside className={styles.rail} aria-label="Citations">
      <div className={styles.railHeader}>
        <Label>Citations</Label>
        <span className={styles.railCount}>
          {turn === undefined || turn.citations.length === 0
            ? ""
            : `${turn.citations.length} retrieved · ${citedIndexes.size} cited`}
        </span>
      </div>
      <div className={styles.railBody}>
        {turn === undefined || turn.citations.length === 0 ? (
          turn?.state === "running" ? (
            <p className={styles.railEmpty}>Searching the index.</p>
          ) : null
        ) : (
          <ul>
            {turn.citations.map((citation, position) => (
              <li key={citation.chunkId}>
                <button
                  type="button"
                  id={`citation-${citation.index}`}
                  className={`${styles.citation} ${
                    citedIndexes.has(citation.index) ? "" : styles.citationUncited
                  } ${citation.index === activeCitationIndex ? styles.citationActive : ""}`}
                  style={{ animationDelay: `${Math.min(position, 8) * 35}ms` }}
                  onClick={() => {
                    onSelect(citation.index);
                    setOpenChunkIds((previous) =>
                      previous.includes(citation.chunkId)
                        ? previous.filter((chunkId) => chunkId !== citation.chunkId)
                        : [...previous, citation.chunkId],
                    );
                  }}
                  aria-expanded={openChunkIds.includes(citation.chunkId)}
                >
                  <span className={styles.citationHead}>
                    <span className={styles.citationIndex}>{citation.index}</span>
                    <span className={styles.citationTitle}>{citation.externalTitle}</span>
                  </span>
                  {citation.headingPath.length === 0 ? null : (
                    <span className={styles.citationPath}>{citation.headingPath.join(" › ")}</span>
                  )}
                  <span className={styles.citationMeter}>
                    <span className={styles.ticks} aria-hidden="true">
                      {Array.from({ length: 16 }, (_tick, tickPosition) => (
                        <span
                          key={tickPosition}
                          className={`${styles.tick} ${
                            tickPosition < Math.round(citation.score * 16) ? styles.tickFilled : ""
                          }`}
                        />
                      ))}
                    </span>
                    <span className={styles.score}>similarity {citation.score.toFixed(2)}</span>
                  </span>
                  <span
                    className={`${styles.chunk} ${
                      openChunkIds.includes(citation.chunkId) ? styles.chunkOpen : ""
                    }`}
                  >
                    {citation.text
                      .replace(/^#{1,6}\s+/gm, "")
                      .replace(/\*\*/g, "")
                      .replace(/`/g, "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
