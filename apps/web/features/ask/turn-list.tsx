import type { ReactNode } from "react";

import { AnswerBody } from "./answer-body";
import styles from "./ask.module.css";
import type { Turn } from "@knowledgestack/shared/chat";

/** The thread: one article per turn, with the question, the model, the tool steps, the rows of every database query, and the answer. Only the turn at `activeTurnIndex` highlights a citation mark, because the rail shows that turn alone. */
export function TurnList({
  turns,
  activeTurnIndex,
  activeCitationIndex,
  onCitationSelect,
}: {
  turns: Turn[];
  activeTurnIndex: number;
  activeCitationIndex: number | null;
  onCitationSelect: (turnIndex: number, citationIndex: number) => void;
}): ReactNode {
  return (
    <div className={styles.streamInner}>
      {turns.map((turn, position) => (
        <article
          key={position}
          className={`${styles.turn} ${position === activeTurnIndex ? styles.turnActive : ""}`}
        >
          <h2 className={styles.question}>{turn.question}</h2>
          {turn.modelId === "" ? null : (
            <p className={styles.step}>
              <span className={styles.stepLabel}>model</span>
              <span className={styles.stepText}>{turn.modelId}</span>
            </p>
          )}
          {turn.displayTexts.map((step, stepPosition) => (
            <p key={stepPosition} className={styles.step}>
              <span className={styles.stepText}>{step}</span>
            </p>
          ))}
          {turn.state === "running" && turn.displayTexts.length === 0 ? (
            <p className={styles.step}>
              <span className={styles.stepLabel}>reading the question</span>
            </p>
          ) : null}
          {turn.answer === "" ? null : (
            <div className={styles.answer}>
              <AnswerBody
                text={turn.answer}
                activeCitationIndex={position === activeTurnIndex ? activeCitationIndex : null}
                onCitationSelect={(citationIndex) => onCitationSelect(position, citationIndex)}
              />
            </div>
          )}
          {turn.state === "running" ? <span className={styles.caret} /> : null}
          {turn.state === "error" ? <p className={styles.failure}>{turn.errorMessage}</p> : null}
        </article>
      ))}
    </div>
  );
}
