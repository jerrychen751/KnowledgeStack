import { Body, Controller, Get, HttpCode, Logger, Post, Req, Res, UseGuards } from "@nestjs/common";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";

import { Public } from "../auth/public.decorator.js";

import { McpServerFactory } from "./mcp-server.factory.js";
import { McpTokenGuard } from "./mcp-token.guard.js";
import type { ResolvedMcpToken } from "./mcp-token.service.js";

@Controller("mcp")
export class McpController {
  constructor(private readonly mcpServerFactory: McpServerFactory) {}

  /** Read the JSON-RPC method and the tool name for one log line. The body is whatever the client sent, so every field is optional. */
  private describeMessage(body: unknown): string {
    if (typeof body !== "object" || body === null) {
      return "unreadable";
    }

    const message = body as { method?: unknown; params?: { name?: unknown } };
    const method = typeof message.method === "string" ? message.method : "unreadable";
    const toolName = typeof message.params?.name === "string" ? message.params.name : "";

    return toolName === "" ? method : `${method} ${toolName}`;
  }

  /**
   * Answer one JSON-RPC message. The transport writes the HTTP response, so this method returns nothing.
   *
   * Each request builds its own server and its own transport, both with no session, and closes both when the
   * socket closes. The server sends no notification of its own, so a session would carry nothing and a
   * session map would hold one server for every client that never sends DELETE.
   */
  @Public()
  @UseGuards(McpTokenGuard)
  @Post()
  async handleMessage(
    @Body() body: unknown,
    @Req() request: IncomingMessage & { mcpToken: ResolvedMcpToken },
    @Res() response: ServerResponse,
  ): Promise<void> {
    const startedAt = Date.now();
    const server = this.mcpServerFactory.createServer(request.mcpToken);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } finally {
      // The line never carries the token or the arguments, because a query string and a SQL statement both hold business text.
      Logger.log(
        `${request.mcpToken.userId} ${request.mcpToken.mcpTokenId} ${this.describeMessage(body)} ${Date.now() - startedAt}ms`,
        McpController.name,
      );
    }
  }

  /** This server opens no server-to-client stream, and the specification answers 405 for that case. */
  @Public()
  @Get()
  @HttpCode(405)
  rejectStream(): void {}
}
