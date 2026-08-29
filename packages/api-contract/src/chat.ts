/** The wire shapes of the /chat routes, which answer a question from the documents and databases of the open workspace. */

import { z } from "zod";

import { sourceProviderSchema } from "./sources.js";

export const listModelsResponseSchema = z.object({
  modelIds: z.array(z.string()).readonly(),
  defaultModelId: z.string(),
});

/** The body `GET /chat/models` answers with, cheapest model first. Each entry is a model id, such as "gpt-5.6-luna", and the browser shows it as written. `defaultModelId` names the model that answers a request without a `modelId` field. */
export type ListModelsResponse = z.infer<typeof listModelsResponseSchema>;

export const chatSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** One stored chat, without its turns. `title` is the first 60 characters of the first question. `createdAt` and `updatedAt` are ISO 8601 timestamps, such as "2026-08-29T16:42:03.000Z". */
export type Chat = z.infer<typeof chatSchema>;

export const citationSchema = z.object({
  index: z.number().int(),
  chunkId: z.string(),
  externalTitle: z.string(),
  externalUrl: z.string(),
  provider: sourceProviderSchema,
  headingPath: z.array(z.string()),
  text: z.string(),
  similarityScore: z.number(),
});

/** One retrieved chunk, and the number the answer writes as [index] when it uses that chunk. `similarityScore` is the cosine similarity from 0 through 1. A chunk that a later search returns again keeps the number the first search gave it. */
export type Citation = z.infer<typeof citationSchema>;

export const queryResultSchema = z.object({
  database: z.string(),
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

/** One result set of an `execute_sql` call. `database` is the registered name and `sql` is the statement the model wrote. Every value in `rows` is already text, with a null rendered as an empty string. */
export type QueryResult = z.infer<typeof queryResultSchema>;

export const turnSchema = z.object({
  turnIndex: z.number().int(),
  question: z.string(),
  modelId: z.string(),
  displayTexts: z.array(z.string()),
  citations: z.array(citationSchema),
  queryResults: z.array(queryResultSchema),
  answer: z.string(),
  state: z.enum(["running", "done", "error"]),
  errorMessage: z.string(),
});

/** One question and the answer to it. `turnIndex` is the place of the turn inside its chat, 0-based and contiguous. `displayTexts` holds one line for each tool call and each compaction, in order. `citations` holds every chunk the searches retrieved, and the answer text marks the ones it used as `[index]`. `queryResults` holds one entry per database query, in order. A turn that never finished carries the state `error` and the partial answer the run produced. */
export type Turn = z.infer<typeof turnSchema>;

export const contextUsageSchema = z.object({
  turnCount: z.number().int(),
  maxTurnCount: z.number().int(),
  tokenCount: z.number().int(),
  maxTokenCount: z.number().int(),
  fraction: z.number(),
});

/** How full the chat is against the two limits that trigger a compaction. A turn is one question and the answer to it. `tokenCount` measures the summary and the messages the API sends to the model, and no other part of the request. `fraction` is the larger of the two ratios, held at 1 once either limit is reached, and the answer that reaches 1 compacts before it runs. */
export type ContextUsage = z.infer<typeof contextUsageSchema>;

export const listChatsResponseSchema = z.object({
  chats: z.array(chatSchema),
});

/** The body `GET /chat` answers with, newest chat first. */
export type ListChatsResponse = z.infer<typeof listChatsResponseSchema>;

export const createChatResponseSchema = z.object({
  chat: chatSchema,
});

/** The body `POST /chat` answers with. The chat holds no turn yet, and its title is empty until the first question arrives. */
export type CreateChatResponse = z.infer<typeof createChatResponseSchema>;

export const readChatResponseSchema = z.object({
  chat: chatSchema,
  turns: z.array(turnSchema),
  usage: contextUsageSchema,
});

/** The body `GET /chat/:chatId` answers with. `turns` is every turn of the chat, oldest first, including the ones a compaction summarized. `usage` reports the size the next question starts from. */
export type ReadChatResponse = z.infer<typeof readChatResponseSchema>;

export const createTurnRequestSchema = z.object(
  {
    question: z
      .string({ error: "question must be a non-empty string." })
      .trim()
      .min(1, "question must be a non-empty string.")
      // The process limit is REQUEST_BODY_LIMIT, and no model context holds a question this long.
      .max(1_000_000, "question must hold 1000000 characters or fewer."),
    modelId: z.string({ error: "modelId must be a string." }).nullish(),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /chat/:chatId/turns` reads. `question` holds 1 through 1000000 characters. `modelId` names one of the models `GET /chat/models` reports, and the API uses the default when the field is absent. */
export type CreateTurnRequest = z.infer<typeof createTurnRequestSchema>;

export const chatAnswerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool"), displayText: z.string() }),
  z.object({ type: z.literal("citations"), citations: z.array(citationSchema) }),
  z.object({ type: z.literal("rows"), ...queryResultSchema.shape }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("compaction"), summary: z.string(), turnCount: z.number().int() }),
  z.object({ type: z.literal("context"), usage: contextUsageSchema }),
]);

/** A frame the answer generator produces while it runs. A `tool` frame carries `displayText`, the complete tool display text for one call, such as "searched pension rules" or "rejected execute_sql". A `rows` frame carries the result of one `execute_sql` call: `database` is the registered name, `sql` is the statement the model wrote, and every value in `rows` is already text, with a null rendered as an empty string. A `compaction` frame carries `turnCount`, the compacted turn count, and reports that those oldest turns became `summary`; the chat row records both, so the browser draws the frame and stores nothing. A `context` frame reports the size the next question starts from, and arrives once the answer is complete. */
export type ChatAnswerEvent = z.infer<typeof chatAnswerEventSchema>;

export const chatStreamEventSchema = z.union([
  chatAnswerEventSchema,
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

/** Every frame the `POST /chat/:chatId/turns` stream carries, one JSON object on each `data:` line. The controller appends `done` on success and `error` on failure, so the client must treat a stream that ends without either as a failure. */
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
