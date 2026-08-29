/**
 * This module owns every tool the chat agent may call.
 *
 * ToolRegistry reads the @Tool methods of every provider at startup, so a new tool needs only that
 * decorator on a method of a provider this app imports. DocumentTools holds search_document_chunks: it
 * embeds the query with the chunk embedding model, then ranks every chunk of the workspace by cosine
 * distance in Postgres. DatabaseTools holds list_databases, list_tables, describe_tables and execute_sql, which reach the business
 * databases the workspace registered through DatabaseConnectionsModule. The chat agent reaches a tool
 * through the registry, and the MCP server will report the same declarations and reach the same methods.
 */

import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { DatabaseConnectionsModule } from "../database-connections/database-connections.module.js";
import { EmbeddingModule } from "../embedding/embedding.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { DatabaseTools } from "./database.tools.js";
import { DocumentTools } from "./document.tools.js";
import { ToolRegistry } from "./tool.registry.js";

@Module({
  imports: [DatabaseConnectionsModule, DiscoveryModule, EmbeddingModule, PrismaModule],
  providers: [DatabaseTools, DocumentTools, ToolRegistry],
  exports: [ToolRegistry],
})
export class ToolsModule {}
