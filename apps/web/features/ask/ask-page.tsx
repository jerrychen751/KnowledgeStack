"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ListModelsResponse } from "@knowledgestack/shared/chat";
import type { ListSourcesResponse, Source } from "@knowledgestack/shared/sources";

import { requestJson } from "@/lib/api-client";

import styles from "./ask.module.css";
import { ChatList } from "./chat-list";
import { CitationRail } from "./citation-rail";
import { Composer } from "./composer";
import { Opening } from "./opening";
import { TurnList } from "./turn-list";
import { useChatList } from "./use-chat-list";
import { useOpenChat } from "./use-open-chat";

export function AskPage({ chatId }: { chatId: string | null }): ReactNode {
  const [question, setQuestion] = useState("");
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [modelIds, setModelIds] = useState<readonly string[]>([]);
  const [modelId, setModelId] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);
  const {
    openChatId,
    turns,
    isRunning,
    isLoadingChat,
    loadFailure,
    usage,
    openChat,
    askQuestion,
  } = useOpenChat(chatId, modelId, modelIds);
  const { chats, listFailure, refreshChats, deleteChat } = useChatList();
  const activeTurnIndex = selectedTurnIndex ?? turns.length - 1;

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
    void refreshChats();
  }, [openChatId, isRunning, refreshChats]);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream !== null && isPinnedToBottom.current) {
      stream.scrollTop = stream.scrollHeight;
    }
  }, [turns]);

  const submitQuestion = () => {
    if (isRunning || isLoadingChat || question.trim() === "") {
      return;
    }

    setSelectedTurnIndex(null);
    setActiveCitationIndex(null);
    setQuestion("");
    isPinnedToBottom.current = true;
    void askQuestion(question);
  };

  const showChat = (nextChatId: string | null) => {
    setSelectedTurnIndex(null);
    setActiveCitationIndex(null);
    isPinnedToBottom.current = true;
    openChat(nextChatId);
  };

  return (
    <div className={styles.layout}>
      <ChatList
        chats={chats}
        openChatId={openChatId}
        listFailure={listFailure}
        onOpen={showChat}
        onDelete={async (deletedChatId) => {
          if (await deleteChat(deletedChatId)) {
            if (deletedChatId === openChatId) {
              showChat(null);
            }
          }
        }}
      />

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
          {loadFailure !== "" ? (
            <p className={styles.loadFailure}>{loadFailure}</p>
          ) : isLoadingChat ? (
            <p className={styles.loadingChat}>Reading the chat</p>
          ) : turns.length === 0 ? (
            <Opening sources={sources} />
          ) : (
            <TurnList
              turns={turns}
              activeTurnIndex={activeTurnIndex}
              activeCitationIndex={activeCitationIndex}
              onCitationSelect={(turnIndex, citationIndex) => {
                setSelectedTurnIndex(turnIndex);
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
          isLoadingChat={isLoadingChat}
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
