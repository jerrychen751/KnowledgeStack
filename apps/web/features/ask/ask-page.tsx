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

export function AskPage({ chatId }: { chatId: string | null }): ReactNode {
  const [question, setQuestion] = useState("");
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [modelIds, setModelIds] = useState<readonly string[]>([]);
  const [modelId, setModelId] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);
  const { turns, isRunning, usage, askQuestion } = useAnswerStream(chatId, modelId, modelIds);

  useEffect(() => {
    requestJson<ListSourcesResponse>("/api/sources")
      .then((body) => setSources(body.sources))
      .catch(() => setSources([]));

    requestJson<ListModelsResponse>("/api/chat/models")
      .then((body) => {
        setModelIds(body.modelIds);
        setModelId(body.defaultModelId);
      })
      .catch(() => setModelIds([]));
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

    setActiveTurnIndex(turns.length);
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
              activeTurnIndex={activeTurnIndex}
              activeCitationIndex={activeCitationIndex}
              onCitationSelect={(turnIndex, citationIndex) => {
                setActiveTurnIndex(turnIndex);
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
          modelIds={modelIds}
          modelId={modelId}
          onModelIdChange={setModelId}
          usage={usage}
        />
      </section>

      <CitationRail
        turn={turns[activeTurnIndex]}
        activeTurnIndex={activeTurnIndex}
        activeCitationIndex={activeCitationIndex}
        onSelect={setActiveCitationIndex}
      />
    </div>
  );
}
