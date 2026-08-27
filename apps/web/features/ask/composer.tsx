import { useEffect, useRef, type ReactNode } from "react";

import type { ContextUsage } from "@knowledgestack/shared/chat";

import { Button } from "@/components/button";

import styles from "./ask.module.css";
import { ContextRing } from "./context-ring";

/** The question box under the thread, with the model picker and the context ring beside it. The textarea grows with the text. Enter submits and Shift with Enter writes a new line. */
export function Composer({
  question,
  onQuestionChange,
  onSubmit,
  isRunning,
  models,
  modelId,
  onModelChange,
  usage,
}: {
  question: string;
  onQuestionChange: (question: string) => void;
  onSubmit: () => void;
  isRunning: boolean;
  models: readonly string[];
  modelId: string;
  onModelChange: (modelId: string) => void;
  usage: ContextUsage | null;
}): ReactNode {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input !== null) {
      // Measure from zero, not from auto: a flex item stretches under auto and reports the stretched height.
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    }
  }, [question]);

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.composerInner}>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          value={question}
          placeholder="Ask about your documents"
          aria-label="Ask about your documents"
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={isRunning || question.trim() === ""}
        >
          {isRunning ? "Answering" : "Ask"}
        </Button>
      </div>
      <div className={styles.composerFoot}>
        <label className={styles.modelPicker}>
          <span className={styles.stepLabel}>Model</span>
          <select
            className={styles.modelSelect}
            value={modelId}
            disabled={isRunning || models.length === 0}
            onChange={(event) => onModelChange(event.target.value)}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        {usage === null ? null : <ContextRing usage={usage} />}
      </div>
    </form>
  );
}
