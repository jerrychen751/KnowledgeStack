"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatStreamEvent,
  ContextUsage,
  CreateChatResponse,
  CreateTurnRequest,
  ReadChatResponse,
  Turn,
} from "@knowledgestack/api-contract/chat";

import { RedirectError, requestJson, sendRequest } from "@/lib/api-client";

/** Hold the turns of one chat and run one question at a time against `POST /chat/:chatId/turns`.
 *
 * The API stores every turn, so this hook keeps no summary and no compacted turn count. `routeChatId` names the chat to load on mount, and a null value starts an empty one. `askQuestion` opens the chat on the first question, appends a turn, reads the Server-Sent Events stream into it, and marks it done or error. Call it only when `isRunning` and `isLoadingChat` are both false and the text is not blank; it reads the index of the new turn from the current length, and a call during a read would write into the wrong turn and leave `isLoadingChat` set.
 *
 * `usage` reports how full the chat is after the last answer, and is null until the first answer finishes.
 *
 * The hook also owns which chat is open. `openChat` clears the thread, reads the next chat and writes the URL with `pushState`, so no Next.js navigation unmounts this page and drops a running stream. `openChat(null)` starts an empty chat at `/`. A `popstate` listener runs the same read for the back button. `isLoadingChat` is true while a read is in flight, and `loadFailure` carries the message when a read fails.
 *
 * A chat switch during an answer makes that answer inert in the browser: it stops writing turns, usage and the run state, and the composer accepts the next question at once. The API keeps the stream open and stores the finished turn, so the abandoned chat holds the complete answer.
 */
export function useOpenChat(
  routeChatId: string | null,
  modelId: string,
  modelIds: readonly string[],
): {
  openChatId: string | null;
  turns: Turn[];
  isRunning: boolean;
  isLoadingChat: boolean;
  loadFailure: string;
  usage: ContextUsage | null;
  openChat: (chatId: string | null) => void;
  askQuestion: (text: string) => Promise<void>;
} {
  const [openChatId, setOpenChatId] = useState(routeChatId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(routeChatId !== null);
  const [loadFailure, setLoadFailure] = useState("");
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const latestReadId = useRef(0);

  const readChat = useCallback((nextChatId: string | null) => {
    const readId = (latestReadId.current += 1);
    setOpenChatId(nextChatId);
    setTurns([]);
    setIsRunning(false);
    setUsage(null);
    setLoadFailure("");
    setIsLoadingChat(nextChatId !== null);
    if (nextChatId === null) {
      return;
    }

    requestJson<ReadChatResponse>(`/api/chat/${nextChatId}`)
      .then((body) => {
        if (latestReadId.current === readId) {
          setTurns(body.turns);
          setUsage(body.usage);
        }
      })
      .catch((error) => {
        if (latestReadId.current === readId && !(error instanceof RedirectError)) {
          setLoadFailure(error instanceof Error ? error.message : "The chat did not load.");
        }
      })
      .finally(() => {
        if (latestReadId.current === readId) {
          setIsLoadingChat(false);
        }
      });
  }, []);

  const openChat = useCallback(
    (nextChatId: string | null) => {
      window.history.pushState(null, "", nextChatId === null ? "/" : `/ask/${nextChatId}`);
      readChat(nextChatId);
    },
    [readChat],
  );

  useEffect(() => {
    readChat(routeChatId);
  }, [routeChatId, readChat]);

  useEffect(() => {
    const followHistory = () => {
      const path = window.location.pathname;
      readChat(path.startsWith("/ask/") ? path.slice("/ask/".length) : null);
    };

    window.addEventListener("popstate", followHistory);

    return () => window.removeEventListener("popstate", followHistory);
  }, [readChat]);

  const askQuestion = useCallback(
    async (text: string) => {
      const asked = text.trim();
      const turnIndex = turns.length;
      const runId = (latestReadId.current += 1);
      const changeTurn = (change: (turn: Turn) => Turn) => {
        if (latestReadId.current !== runId) {
          return;
        }

        setTurns((previous) =>
          previous.map((turn, index) => (index === turnIndex ? change(turn) : turn)),
        );
      };

      setTurns((previous) => [
        ...previous,
        {
          turnIndex,
          question: asked,
          modelId: modelIds.includes(modelId) ? modelId : "",
          displayTexts: [],
          citations: [],
          queryResults: [],
          answer: "",
          state: "running",
          errorMessage: "",
        },
      ]);
      setIsRunning(true);

      try {
        // The URL carries the chat id after the first question, so a reload of this page restores the turns.
        let answeringChatId = openChatId;
        if (answeringChatId === null) {
          const created = await requestJson<CreateChatResponse>("/api/chat", { method: "POST" });
          answeringChatId = created.chat.id;
          setOpenChatId(answeringChatId);
          window.history.replaceState(null, "", `/ask/${answeringChatId}`);
        }

        const response = await sendRequest(`/api/chat/${answeringChatId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: asked, modelId } satisfies CreateTurnRequest),
        });
        if (response.body === null) {
          throw new Error("The API answered the question with no body.");
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
                displayTexts: [...turn.displayTexts, event.displayText],
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
            } else if (event.type === "rows") {
              changeTurn((turn) => ({
                ...turn,
                queryResults: [
                  ...turn.queryResults,
                  {
                    database: event.database,
                    sql: event.sql,
                    columns: event.columns,
                    rows: event.rows,
                  },
                ],
              }));
            } else if (event.type === "delta") {
              changeTurn((turn) => ({ ...turn, answer: turn.answer + event.text }));
            } else if (event.type === "compaction") {
              changeTurn((turn) => ({
                ...turn,
                displayTexts: [
                  ...turn.displayTexts,
                  `compacted ${event.turnCount} earlier ${event.turnCount === 1 ? "turn" : "turns"} into notes`,
                ],
              }));
            } else if (event.type === "context") {
              if (latestReadId.current === runId) {
                setUsage(event.usage);
              }
            } else if (event.type === "error") {
              throw new Error(event.message);
            } else if (event.type === "done") {
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
        if (error instanceof RedirectError) {
          return;
        }

        changeTurn((turn) => ({
          ...turn,
          state: "error",
          errorMessage: error instanceof Error ? error.message : "The answer failed.",
        }));
      } finally {
        if (latestReadId.current === runId) {
          setIsRunning(false);
        }
      }
    },
    [modelId, modelIds, openChatId, turns],
  );

  return { openChatId, turns, isRunning, isLoadingChat, loadFailure, usage, openChat, askQuestion };
}
