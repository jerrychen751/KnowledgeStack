import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { EmbeddingService } from "../embedding/embedding.service.js";
import type { SourceProvider } from "../generated/prisma/enums.js";

type SearchResult = {
  chunkId: string;
  text: string;
  headingPath: string[];
  // Cosine similarity from 0 through 1. pgvector returns the distance, and the query subtracts it from 1.
  score: number;
  externalTitle: string;
  externalUrl: string;
  provider: SourceProvider;
};

@Injectable()
export class SearchDocumentsTool {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Return the chunks of the workspace closest to the query, nearest first.
   *
   * The query text is embedded with the model that embedded the chunks, so both vectors share one space.
   * A document indexed before its embedding write finished carries a null vector and never matches.
   */
  async searchDocuments(workspaceId: string, query: string, limit: number): Promise<SearchResult[]> {
    const queryVector = await this.embeddingService.embedQuery(query);

    // Prisma Client cannot read the Unsupported vector column, so the search needs raw SQL.
    // pgvector parses the text form of a vector, such as '[0.031,-0.017,...]' for 1536 values.
    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        c.id AS "chunkId",
        c.text,
        c.heading_path AS "headingPath",
        1 - (c.embedding <=> ${`[${queryVector.join(",")}]`}::vector) AS "score",
        d.external_title AS "externalTitle",
        d.external_url AS "externalUrl",
        s.provider
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      WHERE s.workspace_id = ${workspaceId} AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${`[${queryVector.join(",")}]`}::vector
      LIMIT ${limit}
    `;
  }
}
