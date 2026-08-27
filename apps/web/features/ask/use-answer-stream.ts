"use client";

import { useCallback, useState } from "react";

import type {
  ChatStreamEvent,
  Citation,
  ContextUsage,
  StreamAnswerRequest,
} from "@knowledgestack/shared/chat";

import { RedirectError, sendRequest } from "@/lib/api-client";

/** One question and the answer to it. `steps` lists the tool calls the answer made, in order. `citations` holds every chunk the searches retrieved, and the answer text marks the ones it used as `[index]`. */
export type Turn = {
  question: string;
  modelId: string;
  steps: { action: string; detail: string }[];
  citations: Citation[];
  answer: string;
  state: "running" | "done" | "error";
  errorMessage: string;
};

/** Hold the conversation and run one question at a time against `POST /chat`.
 *
 * `askQuestion` appends a turn, reads the Server-Sent Events stream into it, and marks it done or error. It also folds a `compaction` frame into the summary it sends with every later question, so the caller never handles that. Call it only when `isRunning` is false and the text is not blank; it computes the position of the new turn from the current length and a second call in flight would write into the wrong turn.
 *
 * `usage` reports how full the conversation is after the last answer, and is null until the first answer finishes.
 */
export function useAnswerStream(modelId: string, models: readonly string[]): {
  turns: Turn[];
  isRunning: boolean;
  usage: ContextUsage | null;
  askQuestion: (text: string) => Promise<void>;
} {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState("");
  const [compactedTurnCount, setCompactedTurnCount] = useState(0);
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  const askQuestion = useCallback(
    async (text: string) => {
      const asked = text.trim();
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
      setIsRunning(true);

      try {
        const response = await sendRequest("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, model: modelId, summary } satisfies StreamAnswerRequest),
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
    [compactedTurnCount, modelId, models, summary, turns],
  );

  return { turns, isRunning, usage, askQuestion };
}
