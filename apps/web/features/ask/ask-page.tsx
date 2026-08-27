"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ListModelsResponse } from "@knowledgestack/shared/chat";
import type { ListSourcesResponse, Source } from "@knowledgestack/shared/sources";

import { requestJson } from "@/lib/api-client";

import styles from "./ask.module.css";
import { CitationRail } from "./citation-rail";
import { Composer } from "./composer";
import { Opening } from "./opening";
import { TurnList } from "./turn-list";
import { useAnswerStream } from "./use-answer-stream";

export function AskPage(): ReactNode {
  const [question, setQuestion] = useState("");
  const [activeTurnPosition, setActiveTurnPosition] = useState(0);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [models, setModels] = useState<readonly string[]>([]);
  const [modelId, setModelId] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);
  const { turns, isRunning, usage, askQuestion } = useAnswerStream(modelId, models);

  useEffect(() => {
    requestJson<ListSourcesResponse>("/api/sources")
      .then((body) => setSources(body.sources))
      .catch(() => setSources([]));

    requestJson<ListModelsResponse>("/api/chat/models")
      .then((body) => {
        setModels(body.models);
        setModelId(body.defaultModelId);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream !== null && isPinnedToBottom.current) {
      stream.scrollTop = stream.scrollHeight;
    }
  }, [turns]);

  const submitQuestion = () => {
    if (isRunning || question.trim() === "") {
      return;
    }

    setActiveTurnPosition(turns.length);
    setActiveCitationIndex(null);
    setQuestion("");
    isPinnedToBottom.current = true;
    void askQuestion(question);
  };

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
            <Opening sources={sources} />
          ) : (
            <TurnList
              turns={turns}
              activeTurnPosition={activeTurnPosition}
              activeCitationIndex={activeCitationIndex}
              onCitationSelect={(turnPosition, citationIndex) => {
                setActiveTurnPosition(turnPosition);
                setActiveCitationIndex(citationIndex);
              }}
            />
          )}
        </div>

        <Composer
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={submitQuestion}
          isRunning={isRunning}
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          usage={usage}
        />
      </section>

      <CitationRail
        turn={turns[activeTurnPosition]}
        activeTurnPosition={activeTurnPosition}
        activeCitationIndex={activeCitationIndex}
        onSelect={setActiveCitationIndex}
      />
    </div>
  );
}
