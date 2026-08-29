/** The two bodies any route of any domain answers with. A body one domain owns is in that domain's file. */

import { z } from "zod";

export const statusResponseSchema = z.object({
  status: z.literal("ok"),
});

/** The body a route answers with when it performs an action and returns no value of its own. */
export type StatusResponse = z.infer<typeof statusResponseSchema>;

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  error: z.string().optional(),
});

/** The body Nest answers with for every 4xx and 5xx, such as `{ statusCode: 400, message: "code must be a non-empty string.", error: "Bad Request" }`. The web app reads `message` and nothing else, and falls back to the status code when the body does not parse. */
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
