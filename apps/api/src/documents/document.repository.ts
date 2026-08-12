import { Injectable } from "@nestjs/common";

import type { DocumentRef } from "../connectors/connector.types.js";
import { PrismaService } from "../database/prisma.service.js";

type DocumentChunkValues = {
  embedding: readonly number[];
  text: string;
  tokenCount: number;
  headingPath: readonly string[];
};

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDocumentByExternalId(
    documentSourceId: string,
    externalId: string,
  ) {
    return this.prisma.document.findUnique({
      where: {
        documentSourceId_externalId: {
          documentSourceId,
          externalId,
        },
      },
    });
  }

  async upsertObservedDocument(
    document: DocumentRef,
    documentSourceId: string,
    lastSeenAt: Date,
  ): Promise<{ id: string; lastIndexedAt: Date | null }> {
    const sourceMetadata = {
      externalTitle: document.externalTitle,
      externalParentId: document.externalParentId,
      externalParentType: document.externalParentType,
      externalUrl: document.externalUrl,
      documentType: document.documentType,
      externalUpdatedAt: document.externalUpdatedAt,
      lastSeenAt,
    };

    return this.prisma.document.upsert({
      where: {
        documentSourceId_externalId: {
          documentSourceId,
          externalId: document.externalId,
        },
      },
      create: {
        documentSourceId,
        externalId: document.externalId,
        ...sourceMetadata,
      },
      update: sourceMetadata,
      select: {
        id: true,
        lastIndexedAt: true,
      },
    });
  }

  /**
   * Replace every chunk of one document and stamp lastIndexedAt, in one transaction.
   * chunkIndex is the position in `chunks`. A failure leaves the previous chunks and the previous timestamp.
   */
  async reindexDocument(
    documentId: string,
    chunks: readonly DocumentChunkValues[],
    indexedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId } });
      await tx.documentChunk.createMany({
        data: chunks.map((chunk, chunkIndex) => ({
          documentId,
          chunkIndex,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          headingPath: [...chunk.headingPath],
        })),
      });

      // Prisma Client cannot write the Unsupported vector column, so the vectors need raw SQL.
      // pgvector parses the text form of a vector, such as '[0.031,-0.017,...]' for 1536 values.
      await tx.$executeRaw`
        UPDATE document_chunks AS c
        SET embedding = v.embedding::vector
        FROM unnest(
          ${chunks.map((_chunk, chunkIndex) => chunkIndex)}::int[],
          ${chunks.map((chunk) => `[${chunk.embedding.join(",")}]`)}::text[]
        ) AS v(chunk_index, embedding)
        WHERE c.document_id = ${documentId} AND c.chunk_index = v.chunk_index
      `;

      await tx.document.update({
        where: { id: documentId },
        data: { lastIndexedAt: indexedAt },
      });
    });
  }

  /** Read the documents of one source that the pass starting at syncStartedAt did not list. */
  async listStaleDocuments(
    documentSourceId: string,
    syncStartedAt: Date,
  ): Promise<{ id: string; externalId: string }[]> {
    return this.prisma.document.findMany({
      where: {
        documentSourceId,
        lastSeenAt: { lt: syncStartedAt },
      },
      select: {
        id: true,
        externalId: true,
      },
    });
  }

  /** Delete the named documents. The database cascade removes the chunks of each one. */
  async deleteDocuments(documentIds: readonly string[]): Promise<number> {
    const deletion = await this.prisma.document.deleteMany({
      where: { id: { in: [...documentIds] } },
    });

    return deletion.count;
  }
}
