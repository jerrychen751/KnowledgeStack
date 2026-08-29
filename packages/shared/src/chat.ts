/** The wire shapes of the /chat routes, which answer a question from the documents and databases of the open workspace. */

import type { SourceProvider } from "./sources.js";

/** The body `GET /chat/models` answers with, cheapest model first. Each entry is a model id, such as "gpt-5.6-luna", and the browser shows it as written. `defaultModelId` names the model that answers a request without a `modelId` field. */
export type ListModelsResponse = {
  modelIds: readonly string[];
  defaultModelId: string;
};

/** One stored chat, without its turns. `title` is the first 60 characters of the first question. `createdAt` and `updatedAt` are ISO 8601 timestamps, such as "2026-08-29T16:42:03.000Z". */
export type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** One retrieved chunk, and the number the answer writes as [index] when it uses that chunk. `similarityScore` is the cosine similarity from 0 through 1. A chunk that a later search returns again keeps the number the first search gave it. */
export type Citation = {
  index: number;
  chunkId: string;
  externalTitle: string;
  externalUrl: string;
  provider: SourceProvider;
  headingPath: string[];
  text: string;
  similarityScore: number;
};

/** One result set of an `execute_sql` call. `database` is the registered name and `sql` is the statement the model wrote. Every value in `rows` is already text, with a null rendered as an empty string. */
export type QueryResult = {
  database: string;
  sql: string;
  columns: string[];
  rows: string[][];
};

/** One question and the answer to it. `turnIndex` is the place of the turn inside its chat, 0-based and contiguous. `displayTexts` holds one line for each tool call and each compaction, in order. `citations` holds every chunk the searches retrieved, and the answer text marks the ones it used as `[index]`. `queryResults` holds one entry per database query, in order. A turn that never finished carries the state `error` and the partial answer the run produced. */
export type Turn = {
  turnIndex: number;
  question: string;
  modelId: string;
  displayTexts: string[];
  citations: Citation[];
  queryResults: QueryResult[];
  answer: string;
  state: "running" | "done" | "error";
  errorMessage: string;
};

/** How full the chat is against the two limits that trigger a compaction. A turn is one question and the answer to it. `tokenCount` measures the summary and the messages the API sends to the model, and no other part of the request. `fraction` is the larger of the two ratios, held at 1 once either limit is reached, and the answer that reaches 1 compacts before it runs. */
export type ContextUsage = {
  turnCount: number;
  maxTurnCount: number;
  tokenCount: number;
  maxTokenCount: number;
  fraction: number;
};

/** The body `GET /chat` answers with, newest chat first. */
export type ListChatsResponse = {
  chats: Chat[];
};

/** The body `POST /chat` answers with. The chat holds no turn yet, and its title is empty until the first question arrives. */
export type CreateChatResponse = {
  chat: Chat;
};

/** The body `GET /chat/:chatId` answers with. `turns` is every turn of the chat, oldest first, including the ones a compaction summarized. `usage` reports the size the next question starts from. */
export type ReadChatResponse = {
  chat: Chat;
  turns: Turn[];
  usage: ContextUsage;
};

/** The body `POST /chat/:chatId/turns` reads. `question` holds 1 through 1000000 characters. `modelId` names one of the models `GET /chat/models` reports, and the API uses the default when the field is absent. */
export type CreateTurnRequest = {
  question: string;
  modelId?: string;
};

/** A frame the answer generator produces while it runs. A `tool` frame carries `displayText`, the complete tool display text for one call, such as "searched pension rules" or "rejected execute_sql". A `rows` frame carries the result of one `execute_sql` call: `database` is the registered name, `sql` is the statement the model wrote, and every value in `rows` is already text, with a null rendered as an empty string. A `compaction` frame carries `turnCount`, the compacted turn count, and reports that those oldest turns became `summary`; the chat row records both, so the browser draws the frame and stores nothing. A `context` frame reports the size the next question starts from, and arrives once the answer is complete. */
export type ChatAnswerEvent =
  | { type: "tool"; displayText: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "rows"; database: string; sql: string; columns: string[]; rows: string[][] }
  | { type: "delta"; text: string }
  | { type: "compaction"; summary: string; turnCount: number }
  | { type: "context"; usage: ContextUsage };

/** Every frame the `POST /chat/:chatId/turns` stream carries, one JSON object on each `data:` line. The controller appends `done` on success and `error` on failure, so the client must treat a stream that ends without either as a failure. */
export type ChatStreamEvent =
  | ChatAnswerEvent
  | { type: "done" }
  | { type: "error"; message: string };
