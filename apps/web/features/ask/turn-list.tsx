import type { ReactNode } from "react";

import { AnswerBody } from "./answer-body";
import styles from "./ask.module.css";
import type { Turn } from "./use-answer-stream";

/** The thread: one article per turn, with the question, the model, the tool steps, and the answer. Only the turn at `activeTurnPosition` highlights a citation mark, because the rail shows that turn alone. */
export function TurnList({
  turns,
  activeTurnPosition,
  activeCitationIndex,
  onCitationSelect,
}: {
  turns: Turn[];
  activeTurnPosition: number;
  activeCitationIndex: number | null;
  onCitationSelect: (turnPosition: number, citationIndex: number) => void;
}): ReactNode {
  return (
    <div className={styles.streamInner}>
      {turns.map((turn, position) => (
        <article
          key={position}
          className={`${styles.turn} ${position === activeTurnPosition ? styles.turnActive : ""}`}
        >
          <h2 className={styles.question}>{turn.question}</h2>
          {turn.modelId === "" ? null : (
            <p className={styles.step}>
              <span className={styles.stepLabel}>model</span>
              <span className={styles.stepQuery}>{turn.modelId}</span>
            </p>
          )}
          {turn.steps.map((step, stepPosition) => (
            <p key={stepPosition} className={styles.step}>
              <span className={styles.stepLabel}>{step.action}</span>
              {step.detail === "" ? null : (
                <span className={styles.stepQuery}>{step.detail}</span>
              )}
            </p>
          ))}
          {turn.state === "running" && turn.steps.length === 0 ? (
            <p className={styles.step}>
              <span className={styles.stepLabel}>reading the question</span>
            </p>
          ) : null}
          {turn.answer === "" ? null : (
            <div className={styles.answer}>
              <AnswerBody
                text={turn.answer}
                activeCitationIndex={position === activeTurnPosition ? activeCitationIndex : null}
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
