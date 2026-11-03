import { Location } from "@angular/common";
import { DestroyRef, effect, inject, signal, untracked, type Signal } from "@angular/core";

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
 * The API stores every turn, so this class keeps no summary and no compacted turn count. `routeChatId` names the chat to load on mount, and a null value starts an empty one. `askQuestion` opens the chat on the first question, appends a turn, reads the Server-Sent Events stream into it, and marks it done or error. Call it only when `isRunning` and `isLoadingChat` are both false and the text is not blank; it reads the index of the new turn from the current length, and a call during a read would write into the wrong turn and leave `isLoadingChat` set.
 *
 * `usage` reports how full the chat is after the last answer, and is null until the first answer finishes.
 *
 * The class also owns which chat is open. `openChat` clears the thread, reads the next chat and writes the URL with `Location.go`, so no router navigation destroys this page and drops a running stream. `openChat(null)` starts an empty chat at `/`. A `popstate` listener runs the same read for the back button. `isLoadingChat` is true while a read is in flight, and `loadFailure` carries the message when a read fails.
 *
 * A chat switch during an answer makes that answer inert in the browser: it stops writing turns, usage and the run state, and the composer accepts the next question at once. The API keeps the stream open and stores the finished turn, so the abandoned chat holds the complete answer.
 */
export class OpenChat {
  // The router sets `routeChatId` after this class is built, so the effect below writes the first real `openChatId` and `isLoadingChat`.
  readonly openChatId = signal<string | null>(null);
  readonly turns = signal<Turn[]>([]);
  readonly isRunning = signal(false);
  readonly isLoadingChat = signal(false);
  readonly loadFailure = signal("");
  readonly usage = signal<ContextUsage | null>(null);
  private readonly location = inject(Location);
  private latestReadId = 0;

  constructor(
    routeChatId: Signal<string | null>,
    private readonly modelId: Signal<string>,
    private readonly modelIds: Signal<readonly string[]>,
  ) {
    effect(() => {
      const nextChatId = routeChatId();
      untracked(() => this.readChat(nextChatId));
    });

    // The router hears the same popstate but never saw the Location rewrites. It skips a URL equal to the last one it navigated to, so only this read follows that step; it rebinds `chatId` (a second read of the same chat) for another chat on the same route, and destroys this page when the URL crosses between `/` and `/ask/:chatId`.
    const followHistory = () => {
      const path = window.location.pathname;
      this.readChat(path.startsWith("/ask/") ? path.slice("/ask/".length) : null);
    };

    window.addEventListener("popstate", followHistory);
    inject(DestroyRef).onDestroy(() => window.removeEventListener("popstate", followHistory));
  }

  openChat(nextChatId: string | null): void {
    this.location.go(nextChatId === null ? "/" : `/ask/${nextChatId}`);
    this.readChat(nextChatId);
  }

  async askQuestion(text: string): Promise<void> {
    const asked = text.trim();
    const turnIndex = this.turns().length;
    const runId = (this.latestReadId += 1);
    const modelId = this.modelId();
    const changeTurn = (change: (turn: Turn) => Turn) => {
      if (this.latestReadId !== runId) {
        return;
      }

      this.turns.update((previous) =>
        previous.map((turn, index) => (index === turnIndex ? change(turn) : turn)),
      );
    };

    this.turns.update((previous) => [
      ...previous,
      {
        turnIndex,
        question: asked,
        modelId: this.modelIds().includes(modelId) ? modelId : "",
        displayTexts: [],
        citations: [],
        queryResults: [],
        answer: "",
        state: "running",
        errorMessage: "",
      },
    ]);
    this.isRunning.set(true);

    try {
      // The URL carries the chat id after the first question, so a reload of this page restores the turns.
      let answeringChatId = this.openChatId();
      if (answeringChatId === null) {
        const created = await requestJson<CreateChatResponse>("/api/chat", { method: "POST" });
        answeringChatId = created.chat.id;
        this.openChatId.set(answeringChatId);
        this.location.replaceState(`/ask/${answeringChatId}`);
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
            if (this.latestReadId === runId) {
              this.usage.set(event.usage);
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
      if (this.latestReadId === runId) {
        this.isRunning.set(false);
      }
    }
  }

  private readChat(nextChatId: string | null): void {
    const readId = (this.latestReadId += 1);
    this.openChatId.set(nextChatId);
    this.turns.set([]);
    this.isRunning.set(false);
    this.usage.set(null);
    this.loadFailure.set("");
    this.isLoadingChat.set(nextChatId !== null);
    if (nextChatId === null) {
      return;
    }

    requestJson<ReadChatResponse>(`/api/chat/${nextChatId}`)
      .then((body) => {
        if (this.latestReadId === readId) {
          this.turns.set(body.turns);
          this.usage.set(body.usage);
        }
      })
      .catch((error) => {
        if (this.latestReadId === readId && !(error instanceof RedirectError)) {
          this.loadFailure.set(error instanceof Error ? error.message : "The chat did not load.");
        }
      })
      .finally(() => {
        if (this.latestReadId === readId) {
          this.isLoadingChat.set(false);
        }
      });
  }
}
