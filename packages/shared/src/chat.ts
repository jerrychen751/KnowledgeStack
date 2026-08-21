/** The wire shapes of the /chat routes, which answer a question from the documents of the open workspace. */

import type { SourceProvider } from "./sources.js";

/** One turn of the conversation. The browser sends every earlier turn back with each question. */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** One model an answer can run on. `note` is display text, such as "fastest, lowest cost". */
export type ChatModel = {
  id: string;
  label: string;
  note: string;
};

/** The body `GET /chat/models` answers with, cheapest model first. `defaultModelId` names the model that answers a request without a `model` field. */
export type ChatModelListResponse = {
  models: readonly ChatModel[];
  defaultModelId: string;
};

/** The body `POST /chat` reads. It holds one or more messages, and the last one is the question. */
export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
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

/** A frame the answer generator produces while it runs. */
export type ChatAnswerEvent =
  | { type: "search"; query: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string };

/** Every frame the `POST /chat` stream carries, one JSON object on each `data:` line. The controller appends `done` on success and `error` on failure, so the client must treat a stream that ends without either as a failure. */
export type ChatStreamEvent =
  | ChatAnswerEvent
  | { type: "done" }
  | { type: "error"; message: string };
