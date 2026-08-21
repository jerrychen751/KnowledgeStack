/**
 * This module owns every tool the chat agent may call.
 *
 * ToolRegistry reads the @Tool methods of every provider at startup, so a new tool needs only that
 * decorator on a method of a provider this app imports. DocumentTools holds the one tool built so far: it
 * embeds the query with the chunk embedding model, then ranks every chunk of the workspace by cosine
 * distance in Postgres. The chat agent reaches a tool through the registry, and the MCP server will report
 * the same declarations and reach the same methods.
 */

import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { DatabaseModule } from "../database/database.module.js";
import { EmbeddingModule } from "../embedding/embedding.module.js";

import { DocumentTools } from "./document.tools.js";
import { ToolRegistry } from "./tool.registry.js";

@Module({
  imports: [DatabaseModule, DiscoveryModule, EmbeddingModule],
  providers: [DocumentTools, ToolRegistry],
  exports: [ToolRegistry],
})
export class ToolsModule {}
