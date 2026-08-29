import type { ReactNode } from "react";

import type { ContextUsage } from "@knowledgestack/api-contract/chat";

import styles from "./ask.module.css";

/** The gauge beside the composer that reads how full the chat is. It turns to the warning colour at 80 percent, where a compaction is close. */
export function ContextRing({ usage }: { usage: ContextUsage }): ReactNode {
  const circumference = 2 * Math.PI * 6;
  return (
    <span
      className={`${styles.contextRing} ${usage.fraction >= 0.8 ? styles.contextRingHigh : ""}`}
      title={`${usage.turnCount} of ${usage.maxTurnCount} turns and ${usage.tokenCount.toLocaleString()} of ${usage.maxTokenCount.toLocaleString()} tokens. The chat compacts at whichever it reaches first.`}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle className={styles.ringTrack} cx="8" cy="8" r="6" />
        <circle
          className={styles.ringFill}
          cx="8"
          cy="8"
          r="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - usage.fraction)}
        />
      </svg>
      <span className={styles.contextPercent}>{Math.round(usage.fraction * 100)}% context</span>
    </span>
  );
}
