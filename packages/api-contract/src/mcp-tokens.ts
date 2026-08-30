/** The wire shapes of the /mcp-tokens routes, which mint and revoke the bearer tokens an MCP client sends. */

import { z } from "zod";

export const mcpTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** One MCP token of the open workspace, without its secret. The three timestamps are ISO 8601, such as "2026-11-28T16:42:03.000Z". `lastUsedAt` is null until an MCP client sends its first message with the token, which is its handshake and not a tool call. */
export type McpToken = z.infer<typeof mcpTokenSchema>;

export const createMcpTokenRequestSchema = z.object(
  {
    name: z
      .string({ error: "name must be a string." })
      .trim()
      .min(1, "name must hold 1 through 60 characters.")
      .max(60, "name must hold 1 through 60 characters."),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /mcp-tokens` reads. `name` is what the person calls the client, such as "Claude Code on the laptop". */
export type CreateMcpTokenRequest = z.infer<typeof createMcpTokenRequestSchema>;

export const createMcpTokenResponseSchema = z.object({
  mcpToken: mcpTokenSchema,
  secret: z.string(),
  serverUrl: z.string(),
});

/** The body `POST /mcp-tokens` answers with. `secret` is the whole value the client sends, such as "ks_mcp_9f3c...", and this response is the only place it ever appears. `serverUrl` is the address the client posts to, such as "http://127.0.0.1:3001/mcp". */
export type CreateMcpTokenResponse = z.infer<typeof createMcpTokenResponseSchema>;

export const listMcpTokensResponseSchema = z.object({
  mcpTokens: z.array(mcpTokenSchema),
});

/** The body `GET /mcp-tokens` answers with, newest token first. */
export type ListMcpTokensResponse = z.infer<typeof listMcpTokensResponseSchema>;
