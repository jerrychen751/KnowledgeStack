import type { ReactNode } from "react";

import styles from "./ask.module.css";

function renderInline(
  text: string,
  activeCitationIndex: number | null,
  onCitationSelect: (index: number) => void,
): ReactNode[] {
  // The model writes no Markdown beyond these three forms, so this split is the whole parser.
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[\d+\])/g).map((token, position) => {
    if (token.length > 1 && token.startsWith("`") && token.endsWith("`")) {
      return <code key={position}>{token.slice(1, -1)}</code>;
    }
    if (token.length > 4 && token.startsWith("**") && token.endsWith("**")) {
      return <strong key={position}>{token.slice(2, -2)}</strong>;
    }

    const marker = /^\[(\d+)\]$/.exec(token);
    if (marker === null) {
      return token;
    }

    const citationIndex = Number(marker[1]);
    return (
      <button
        key={position}
        type="button"
        className={`${styles.citationMark} ${citationIndex === activeCitationIndex ? styles.citationMarkActive : ""}`}
        onClick={() => onCitationSelect(citationIndex)}
        aria-label={`Show chunk ${citationIndex}`}
      >
        {citationIndex}
      </button>
    );
  });
}

/** Render the answer text of one turn. Each `[n]` marker becomes a button that opens chunk `n` in the citation rail, and `activeCitationIndex` names the marker to highlight. */
export function AnswerBody({
  text,
  activeCitationIndex,
  onCitationSelect,
}: {
  text: string;
  activeCitationIndex: number | null;
  onCitationSelect: (index: number) => void;
}) {
  return text
    .split(/\n{2,}/)
    .filter((block) => block.trim() !== "")
    .map((block, blockPosition) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        return (
          <ul key={blockPosition}>
            {lines.map((line, linePosition) => (
              <li key={linePosition}>
                {renderInline(
                  line.replace(/^\s*[-*]\s+/, ""),
                  activeCitationIndex,
                  onCitationSelect,
                )}
              </li>
            ))}
          </ul>
        );
      }

      return (
        <p key={blockPosition}>
          {renderInline(block, activeCitationIndex, onCitationSelect)}
        </p>
      );
    });
}
