import { Injectable } from "@nestjs/common";

import { DocumentSourceRepository } from "../documents/document-source.repository.js";
import { DocumentRepository } from "../documents/document.repository.js";
import { DocumentType } from "../generated/prisma/enums.js";
import { EmbeddingService } from "../embedding/embedding.service.js";

import { ConnectorResolver } from "./connector.resolver.js";
import { createChunks } from "../chunking/chunking.js";

@Injectable()
export class SyncService {
  constructor(
    private readonly connectorResolver: ConnectorResolver,
    private readonly documentRepository: DocumentRepository,
    private readonly documentSourceRepository: DocumentSourceRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Reconcile one document source with the database, one page of source results at a time.
   *
   * The method writes the metadata of every document the source lists, and stamps `lastSeenAt` with the pass
   * start time. It re-indexes a document when the database holds no index time for it, or when the source
   * edited it after that time. A re-index fetches the body, cuts it into chunks, embeds each chunk, and
   * replaces every chunk stored for the document. It never indexes an attachment, because no connector
   * returns the text of a binary file. It then asks the source about every document the pass did not
   * list, and deletes only the ones the source reports gone, because a listing can omit a live
   * document. The database cascade removes the chunks of a deleted document. It stamps the source with the
   * pass start time last, so `lastSyncedAt` names a pass that finished.
   *
   * A failure aborts the pass. The deletion sweep never runs, the source keeps its previous `lastSyncedAt`,
   * and every document indexed so far keeps its new chunks.
   */
  async sync(documentSourceId: string): Promise<void> {
    const syncStartedAt = new Date();

    const connector = await this.connectorResolver.resolveConnector(documentSourceId);
    let cursor: string | undefined;
    do {
      const page = await connector.listDocuments({
        cursor,
        pageSize: 100,
      });

      for (const document of page.documents) {
        const databaseDocument =
          await this.documentRepository.upsertObservedDocument(
            document,
            documentSourceId,
            syncStartedAt,
          );
        // Docling is not built, so no connector can return the text of an attachment.
        if (document.documentType === DocumentType.attachment) {
          continue;
        }

        if (
          databaseDocument.lastIndexedAt === null ||
          databaseDocument.lastIndexedAt < document.externalUpdatedAt
        ) {
          const documentBody = await connector.fetchDocumentById(document.externalId);
          const documentChunks = await createChunks(documentBody);
          const documentChunkVectors = await this.embeddingService.embedChunks(
            documentChunks.map(
              (chunk) =>
                `${[document.externalTitle, ...chunk.headingPath].join(" > ")}\n${chunk.text}`,
            ),
          );
          // The chunk order is the contract: the repository assigns chunkIndex from the array position.
          await this.documentRepository.reindexDocument(
            databaseDocument.id,
            documentChunks.map((chunk, index) => ({
              embedding: documentChunkVectors[index],
              text: chunk.text,
              tokenCount: chunk.tokenCount,
              headingPath: chunk.headingPath,
            })),
            syncStartedAt,
          );
        }
      }

      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    const staleDocuments = await this.documentRepository.listStaleDocuments(
      documentSourceId,
      syncStartedAt,
    );
    const staleDocumentIds: string[] = [];
    // One request at a time: Notion allows about three requests per second across the integration.
    for (const staleDocument of staleDocuments) {
      const exists = await connector.checkDocumentExists(
        staleDocument.externalId,
      );
      if (!exists) {
        staleDocumentIds.push(staleDocument.id);
      }
    }

    await this.documentRepository.deleteDocuments(staleDocumentIds);
    await this.documentSourceRepository.recordSyncCompletion(
      documentSourceId,
      syncStartedAt,
    );
  }
}
