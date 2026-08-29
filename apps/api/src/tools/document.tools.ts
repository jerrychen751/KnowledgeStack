import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { EmbeddingService } from "../embedding/embedding.service.js";
import type { SourceProvider } from "../generated/prisma/enums.js";

import { Tool } from "./tool.registry.js";
import type { ToolSession } from "./tool.session.js";

type SearchResult = {
  chunkId: string;
  text: string;
  headingPath: string[];
  // Cosine similarity from 0 through 1. pgvector returns the distance, and the query subtracts it from 1.
  similarityScore: number;
  externalTitle: string;
  externalUrl: string;
  provider: SourceProvider;
};

@Injectable()
export class DocumentTools {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Return the six chunks of the workspace closest to `args.query`, nearest first, as the numbered text the
   * model reads, and emit them on the session for the browser to draw.
   *
   * Answers with a correction, for the model to read, when the call carries no query. The query text is
   * embedded with the model that embedded the chunks, so both vectors share one space. A document indexed
   * before its embedding write finished carries a null vector and never matches.
   */
  @Tool({
    name: "search_document_chunks",
    description: "Search the workspace documents by meaning and return the closest chunks.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The words to search for. Use the vocabulary of the documents, not of the question.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    buildDisplayText: (args) =>
      `searched ${typeof args.query === "string" ? args.query.trim() : ""}`.trim(),
  })
  async searchDocumentChunks(session: ToolSession, args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (query === "") {
      return "The call carried no query. Call search_document_chunks again with a query string.";
    }

    const queryVector = await this.embeddingService.embedQuery(query);

    // Prisma Client cannot read the Unsupported vector column, so the search needs raw SQL.
    // pgvector parses the text form of a vector, such as '[0.031,-0.017,...]' for 1536 values.
    const results = await this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        c.id AS "chunkId",
        c.text,
        c.heading_path AS "headingPath",
        1 - (c.embedding <=> ${`[${queryVector.join(",")}]`}::vector) AS "similarityScore",
        d.external_title AS "externalTitle",
        d.external_url AS "externalUrl",
        s.provider
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      WHERE s.workspace_id = ${session.workspaceId} AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${`[${queryVector.join(",")}]`}::vector
      LIMIT 6
    `;

    const citations = results.map((found) => session.cite(found));
    session.emit({ type: "citations", citations });
    if (citations.length === 0) {
      return "No document matched the query.";
    }

    // Example entry may read `[2] Pension rules > Vesting\nA member vests after three years.`, and a blank line joins two entries.
    return citations
      .map(
        (citation) =>
          `[${citation.index}] ${[citation.externalTitle, ...citation.headingPath].join(" > ")}\n${citation.text}`,
      )
      .join("\n\n");
  }
}
