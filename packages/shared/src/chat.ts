/** The wire shapes of the /chat routes, which answer a question from the documents of the open workspace. */

import type { SourceProvider } from "./sources.js";

/** One turn of the conversation. The browser sends every earlier turn back with each question. */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** The body `GET /chat/models` answers with, cheapest model first. Each entry is a model id, such as "gpt-5.6-luna", and the browser shows it as written. `defaultModelId` names the model that answers a request without a `model` field. */
export type ChatModelListResponse = {
  models: readonly string[];
  defaultModelId: string;
};

/** The body `POST /chat` reads. It holds one or more messages, and the last one is the question. `summary` carries the notes that a `compaction` frame of an earlier answer summarized the oldest turns into; send it back unchanged with every later question, or the compacted turns are lost. */
export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  summary?: string;
};

/** One retrieved chunk, and the number the answer writes as [index] when it uses that chunk. `score` is the cosine similarity from 0 through 1. A chunk that a later search returns again keeps the number the first search gave it. */
export type Citation = {
  index: number;
  chunkId: string;
  externalTitle: string;
  externalUrl: string;
  provider: SourceProvider;
  headingPath: string[];
  text: string;
  score: number;
};

/** How full the conversation is against the two limits that trigger a compaction. A turn is one question and the answer to it. `tokenCount` measures the summary and the messages the browser sends, and no other part of the request. `fraction` is the larger of the two ratios, held at 1 once either limit is reached, and the answer that reaches 1 compacts before it runs. */
export type ContextUsage = {
  turnCount: number;
  maxTurnCount: number;
  tokenCount: number;
  maxTokenCount: number;
  fraction: number;
};

/** A frame the answer generator produces while it runs. A `tool` frame reports one call as the browser shows it: `action` is the past-tense verb, such as "searched", and `detail` is the argument text. A call the server rejects before it runs reports `action` as "rejected" and `detail` as the tool name. A `compaction` frame reports that the oldest `compactedTurnCount` turns of the sent messages became `summary`; the browser must stop sending those turns and must send `summary` instead. A `context` frame reports the size the next question starts from, and arrives once the answer is complete. */
export type ChatAnswerEvent =
  | { type: "tool"; action: string; detail: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "compaction"; summary: string; compactedTurnCount: number }
  | { type: "context"; usage: ContextUsage };

/** Every frame the `POST /chat` stream carries, one JSON object on each `data:` line. The controller appends `done` on success and `error` on failure, so the client must treat a stream that ends without either as a failure. */
export type ChatStreamEvent =
  | ChatAnswerEvent
  | { type: "done" }
  | { type: "error"; message: string };
