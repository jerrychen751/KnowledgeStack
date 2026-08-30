import { Injectable } from "@nestjs/common";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { ToolRegistry } from "../tools/tool.registry.js";
import { ToolSession } from "../tools/tool.session.js";

import type { ResolvedMcpToken } from "./mcp-token.service.js";

@Injectable()
export class McpServerFactory {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * Build one MCP server that answers for the caller the token names, with no transport connected yet.
   *
   * It takes the whole caller and not the workspace id alone, so the person and the token stay reachable
   * where the tools run. Every tool filters by workspace today, so `ToolSession` reads that field only.
   *
   * The caller builds one server per request and closes it after the answer, so the server holds no state
   * between messages. It uses the low-level Server class and not McpServer, because registerTool accepts a
   * Zod schema alone and every tool declaration holds a JSON Schema object.
   */
  createServer(mcpToken: ResolvedMcpToken): Server {
    const server = new Server(
      { name: "knowledgestack", title: "KnowledgeStack", version: "1.0.0" },
      {
        capabilities: { tools: {} },
        instructions: [
          "These tools read the documents and the databases of one KnowledgeStack workspace.",
          "Call search_document_chunks before you answer from the documents.",
          "Call list_databases, then list_tables and describe_tables, before you write SQL.",
          "A column name such as cst_typ_cd carries no comment. Search the documents for its meaning first.",
        ].join("\n"),
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.toolRegistry.definitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.parameters as Tool["inputSchema"],
        // Every tool that exists today only reads. A tool that writes must state that here.
        annotations: { readOnlyHint: true, openWorldHint: false },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      if (!this.toolRegistry.has(name)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No tool is named ${name}. Call one of ${this.toolRegistry.names.join(", ")}.`,
            },
          ],
        };
      }

      try {
        // The frames the session collects draw the citation rail and the result table in the browser, and an MCP client draws neither.
        const session = new ToolSession(mcpToken.workspaceId);
        const text = await this.toolRegistry.run(session, name, args ?? {});

        return { content: [{ type: "text", text }] };
      } catch (error) {
        // The specification reports a tool failure inside the result, so the model can read it and choose again.
        return {
          isError: true,
          content: [
            { type: "text", text: error instanceof Error ? error.message : "The tool failed." },
          ],
        };
      }
    });

    return server;
  }
}
