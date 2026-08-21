/**
 * This module searches the stored chunks by meaning.
 *
 * It embeds the query with the chunk embedding model, then ranks every chunk of the workspace by cosine
 * distance in Postgres. The chat agent calls it as a tool, and the MCP server will call the same method.
 */

import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { EmbeddingModule } from "../embedding/embedding.module.js";

import { SearchDocumentsTool } from "./search-documents.tool.js";

@Module({
  imports: [DatabaseModule, EmbeddingModule],
  providers: [SearchDocumentsTool],
  exports: [SearchDocumentsTool],
})
export class ToolsModule {}
