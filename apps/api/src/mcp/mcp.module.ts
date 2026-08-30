/**
 * This module exposes the tools of one workspace over the Model Context Protocol.
 *
 * McpController owns `POST /mcp`, which speaks Streamable HTTP. Each message builds one Server and one
 * transport with no session, answers, and closes both, because this server sends no notification of its own.
 * McpServerFactory maps every declaration ToolRegistry holds to an MCP tool and passes the JSON Schema
 * through unchanged, so the browser agent and an MCP client run one copy of each tool method.
 *
 * McpTokenGuard turns the bearer token into the workspace id every tool call reads. It runs no membership
 * check, because Postgres deletes a token with the membership it hangs off. McpTokenController owns the
 * three browser routes that mint, list and revoke a token; those routes carry the session cookie and the
 * MCP route does not, which is why the MCP route alone is @Public() with its own guard.
 */

import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ToolsModule } from "../tools/tools.module.js";

import { McpController } from "./mcp.controller.js";
import { McpServerFactory } from "./mcp-server.factory.js";
import { McpTokenGuard } from "./mcp-token.guard.js";
import { McpTokenService } from "./mcp-token.service.js";
import { McpTokenController } from "./mcp-token.controller.js";

@Module({
  imports: [AppConfigModule, PrismaModule, ToolsModule],
  controllers: [McpController, McpTokenController],
  providers: [McpServerFactory, McpTokenGuard, McpTokenService],
})
export class McpModule {}
