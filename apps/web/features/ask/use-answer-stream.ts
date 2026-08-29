"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  ChatStreamEvent,
  ContextUsage,
  CreateChatResponse,
  CreateTurnRequest,
  ReadChatResponse,
  Turn,
} from "@knowledgestack/shared/chat";

import { RedirectError, requestJson, sendRequest } from "@/lib/api-client";

/** Hold the turns of one chat and run one question at a time against `POST /chat/:chatId/turns`.
 *
 * The API stores every turn, so this hook keeps no summary and no compacted turn count. `chatId` names the chat to load on mount, and a null value starts an empty one. `askQuestion` opens the chat on the first question, appends a turn, reads the Server-Sent Events stream into it, and marks it done or error. Call it only when `isRunning` is false and the text is not blank; it reads the index of the new turn from the current length, and a second call in flight would write into the wrong turn.
 *
 * `usage` reports how full the chat is after the last answer, and is null until the first answer finishes.
 */
export function useAnswerStream(
  chatId: string | null,
  modelId: string,
  modelIds: readonly string[],
): {
  turns: Turn[];
  isRunning: boolean;
  usage: ContextUsage | null;
  askQuestion: (text: string) => Promise<void>;
} {
  const [openChatId, setOpenChatId] = useState(chatId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  useEffect(() => {
    if (chatId === null) {
      return;
    }

    requestJson<ReadChatResponse>(`/api/chat/${chatId}`)
      .then((body) => {
        setTurns(body.turns);
        setUsage(body.usage);
      })
      .catch(() => setTurns([]));
  }, [chatId]);

  const askQuestion = useCallback(
    async (text: string) => {
      const asked = text.trim();
      const turnIndex = turns.length;
      const changeTurn = (change: (turn: Turn) => Turn) =>
        setTurns((previous) =>
          previous.map((turn, index) => (index === turnIndex ? change(turn) : turn)),
        );

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
              setUsage(event.usage);
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
        setIsRunning(false);
      }
    },
    [modelId, modelIds, openChatId, turns],
  );

  return { turns, isRunning, usage, askQuestion };
}
