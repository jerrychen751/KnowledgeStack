"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type {
  ChatModelListResponse,
  ChatRequest,
  ChatStreamEvent,
  Citation,
  ContextUsage,
} from "@knowledgestack/shared/chat";
import type { ErrorResponse } from "@knowledgestack/shared/http";
import type { Source, SourceListResponse } from "@knowledgestack/shared/sources";

import styles from "./ask.module.css";

type Turn = {
  question: string;
  modelId: string;
  steps: { action: string; detail: string }[];
  citations: Citation[];
  answer: string;
  state: "running" | "done" | "error";
  errorMessage: string;
};

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

function AnswerBody({
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

function ContextRing({ usage }: { usage: ContextUsage }): ReactNode {
  const circumference = 2 * Math.PI * 6;
  return (
    <span
      className={`${styles.contextRing} ${usage.fraction >= 0.8 ? styles.contextRingHigh : ""}`}
      title={`${usage.turnCount} of ${usage.maxTurnCount} turns and ${usage.tokenCount.toLocaleString()} of ${usage.maxTokenCount.toLocaleString()} tokens. The conversation compacts at whichever it reaches first.`}
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

export default function AskPage(): ReactNode {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [activeTurnPosition, setActiveTurnPosition] = useState(0);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [openChunkIds, setOpenChunkIds] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [compactedTurnCount, setCompactedTurnCount] = useState(0);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [models, setModels] = useState<readonly string[]>([]);
  const [modelId, setModelId] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);

  useEffect(() => {
    fetch("/api/sources")
      .then((response) => (response.ok ? response.json() : { sources: [] }))
      .then((body: SourceListResponse) => setSources(body.sources))
      .catch(() => setSources([]));

    fetch("/api/chat/models")
      .then((response) => response.json())
      .then((body: ChatModelListResponse) => {
        setModels(body.models);
        setModelId(body.defaultModelId);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (input !== null) {
      // Measure from zero, not from auto: a flex item stretches under auto and reports the stretched height.
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    }
  }, [question]);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream !== null && isPinnedToBottom.current) {
      stream.scrollTop = stream.scrollHeight;
    }
  }, [turns]);

  useEffect(() => {
    if (activeCitationIndex !== null) {
      document
        .getElementById(`citation-${activeCitationIndex}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeCitationIndex, activeTurnPosition]);

  const askQuestion = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (asked === "" || isRunning) {
        return;
      }

      const turnPosition = turns.length;
      const messages = turns
        .slice(compactedTurnCount)
        .flatMap((turn) => [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.answer },
        ])
        .filter((message) => message.content.trim() !== "")
        .concat({ role: "user" as const, content: asked });

      const changeTurn = (change: (turn: Turn) => Turn) =>
        setTurns((previous) =>
          previous.map((turn, position) => (position === turnPosition ? change(turn) : turn)),
        );

      setTurns((previous) => [
        ...previous,
        {
          question: asked,
          modelId: models.includes(modelId) ? modelId : "",
          steps: [],
          citations: [],
          answer: "",
          state: "running",
          errorMessage: "",
        },
      ]);
      setActiveTurnPosition(turnPosition);
      setActiveCitationIndex(null);
      setQuestion("");
      setIsRunning(true);
      isPinnedToBottom.current = true;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, model: modelId, summary } satisfies ChatRequest),
        });
        if (response.status === 403) {
          window.location.assign("/workspaces");
          return;
        }
        if (!response.ok || response.body === null) {
          const failure = await response.text();
          let message = `The API answered ${response.status}.`;
          try {
            message = (JSON.parse(failure) as Partial<ErrorResponse>).message ?? message;
          } catch {
            message = failure === "" ? message : failure;
          }
          throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawDone = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            if (!frame.startsWith("data: ")) {
              continue;
            }

            const event = JSON.parse(frame.slice(6)) as ChatStreamEvent;
            if (event.type === "tool") {
              changeTurn((turn) => ({
                ...turn,
                steps: [...turn.steps, { action: event.action, detail: event.detail }],
              }));
            } else if (event.type === "citations") {
              changeTurn((turn) => ({
                ...turn,
                citations: [
                  ...turn.citations,
                  ...event.citations.filter(
                    (citation) => !turn.citations.some((held) => held.index === citation.index),
                  ),
                ],
              }));
            } else if (event.type === "delta") {
              changeTurn((turn) => ({ ...turn, answer: turn.answer + event.text }));
            } else if (event.type === "compaction") {
              setSummary(event.summary);
              setCompactedTurnCount((previous) => previous + event.compactedTurnCount);
              changeTurn((turn) => ({
                ...turn,
                steps: [
                  ...turn.steps,
                  {
                    action: "compacted",
                    detail: `${event.compactedTurnCount} earlier ${event.compactedTurnCount === 1 ? "turn" : "turns"} into notes`,
                  },
                ],
              }));
            } else if (event.type === "context") {
              setUsage(event.usage);
            } else if (event.type === "error") {
              throw new Error(event.message);
            } else {
              sawDone = true;
            }
          }
        }

        // The headers leave before the first search runs, so only the done frame proves the answer finished.
        if (!sawDone) {
          throw new Error("The answer stopped before it finished.");
        }
        changeTurn((turn) => ({ ...turn, state: "done" }));
      } catch (error) {
        changeTurn((turn) => ({
          ...turn,
          state: "error",
          errorMessage: error instanceof Error ? error.message : "The answer failed.",
        }));
      } finally {
        setIsRunning(false);
      }
    },
    [compactedTurnCount, isRunning, modelId, models, summary, turns],
  );

  const activeTurn = turns[activeTurnPosition];
  // The retrieval returns more chunks than the answer uses, so the rail marks the ones it cited.
  const citedIndexes = new Set(
    [...(activeTurn?.answer ?? "").matchAll(/\[(\d+)\]/g)].map((marker) => Number(marker[1])),
  );
  const indexedSources = (sources ?? []).filter((source) => source.documentCount > 0);

  return (
    <div className={styles.layout}>
      <section className={styles.thread}>
        <div
          className={`${styles.stream} ${turns.length === 0 ? styles.streamEmpty : ""}`}
          ref={streamRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            isPinnedToBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          {turns.length === 0 ? (
            <div className={styles.opening}>
              <h1 className={styles.openingThesis}>
                Ask a question about your documents.
                <span className={styles.openingClaim}>
                  Every claim in the answer points back to the chunk it came from.
                </span>
              </h1>
              <div className={styles.indexed}>
                <p className="label">
                  {indexedSources.length === 0 ? "Nothing indexed" : "Indexed"}
                </p>
                {indexedSources.length === 0 ? (
                  <p className={styles.openingNote}>
                    Add Markdown or text files on the <Link href="/sources">Sources</Link> page, then
                    come back and ask.
                  </p>
                ) : (
                  <ul className={styles.indexedList}>
                    {indexedSources.map((source) => (
                      <li key={source.id} className={styles.indexedItem}>
                        {source.externalDisplayName} · {source.documentCount} documents ·{" "}
                        {source.chunkCount} chunks
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
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
                        onCitationSelect={(citationIndex) => {
                          setActiveTurnPosition(position);
                          setActiveCitationIndex(citationIndex);
                        }}
                      />
                    </div>
                  )}
                  {turn.state === "running" ? <span className={styles.caret} /> : null}
                  {turn.state === "error" ? (
                    <p className={styles.failure}>{turn.errorMessage}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void askQuestion(question);
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
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void askQuestion(question);
                }
              }}
            />
            <button
              type="submit"
              className="button button--primary"
              disabled={isRunning || question.trim() === ""}
            >
              {isRunning ? "Answering" : "Ask"}
            </button>
          </div>
          <div className={styles.composerFoot}>
            <label className={styles.modelPicker}>
              <span className={styles.stepLabel}>Model</span>
              <select
                className={styles.modelSelect}
                value={modelId}
                disabled={isRunning || models.length === 0}
                onChange={(event) => setModelId(event.target.value)}
              >
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>Shift and Enter start a new line.</p>
            {usage === null ? null : <ContextRing usage={usage} />}
          </div>
        </form>
      </section>

      <aside className={styles.rail} aria-label="Citations">
        <div className={styles.railHeader}>
          <span className="label">Citations</span>
          <span className={styles.railCount}>
            {activeTurn === undefined || activeTurn.citations.length === 0
              ? ""
              : `${activeTurn.citations.length} retrieved · ${citedIndexes.size} cited`}
          </span>
        </div>
        <div className={styles.railBody}>
          {activeTurn === undefined || activeTurn.citations.length === 0 ? (
            activeTurn?.state === "running" ? (
              <p className={styles.railEmpty}>Searching the index.</p>
            ) : null
          ) : (
            <ul>
              {activeTurn.citations.map((citation, position) => (
                <li key={citation.chunkId}>
                  <button
                    type="button"
                    id={`citation-${citation.index}`}
                    className={`${styles.citation} ${
                      citedIndexes.has(citation.index) ? "" : styles.citationUncited
                    } ${citation.index === activeCitationIndex ? styles.citationActive : ""}`}
                    style={{ animationDelay: `${Math.min(position, 8) * 35}ms` }}
                    onClick={() => {
                      setActiveCitationIndex(citation.index);
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
                      <span className={styles.citationPath}>
                        {citation.headingPath.join(" › ")}
                      </span>
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
                      <span className={styles.score}>
                        similarity {citation.score.toFixed(2)}
                      </span>
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
    </div>
  );
}
