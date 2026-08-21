import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { SourceProvider } from "../generated/prisma/enums.js";

/**
 * Every query the sources API makes. The sync pass reads its own source rows through
 * `documents/source-sync.repository.ts`, which resolves connector settings instead of API responses.
 */
@Injectable()
export class SourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSources(workspaceId: string) {
    const sources = await this.prisma.source.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        provider: true,
        externalId: true,
        externalDisplayName: true,
        status: true,
        lastSyncedAt: true,
        _count: { select: { documents: true } },
      },
    });

    const chunkCounts = await this.prisma.$queryRaw<
      { sourceId: string; chunkCount: number }[]
    >`
      SELECT d.source_id AS "sourceId", count(c.id)::int AS "chunkCount"
      FROM documents d
      JOIN document_chunks c ON c.document_id = d.id
      JOIN sources s ON s.id = d.source_id
      WHERE s.workspace_id = ${workspaceId}
      GROUP BY d.source_id
    `;
    const chunkCountBySourceId = new Map(
      chunkCounts.map((row) => [row.sourceId, row.chunkCount]),
    );

    return sources.map((source) => ({
      id: source.id,
      provider: source.provider,
      externalId: source.externalId,
      externalDisplayName: source.externalDisplayName,
      status: source.status,
      lastSyncedAt: source.lastSyncedAt,
      documentCount: source._count.documents,
      chunkCount: chunkCountBySourceId.get(source.id) ?? 0,
    }));
  }

  async listDocuments(sourceId: string) {
    return this.prisma.document.findMany({
      where: { sourceId },
      orderBy: { externalTitle: "asc" },
      select: {
        id: true,
        externalTitle: true,
        externalUrl: true,
        documentType: true,
        externalUpdatedAt: true,
        lastIndexedAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  /**
   * Return the filesystem source that reads `rootDirectory`, and create it when it is absent.
   *
   * A partial unique index guards the pair in Postgres, but Prisma cannot target a partial index in an
   * upsert, so the read and the write are separate statements.
   */
  async saveFilesystemSource(
    workspaceId: string,
    rootDirectory: string,
    externalDisplayName: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.source.findFirst({
      where: { workspaceId, provider: "filesystem", externalId: rootDirectory },
      select: { id: true },
    });
    if (existing !== null) {
      return existing;
    }

    return this.prisma.source.create({
      data: {
        workspaceId,
        provider: "filesystem",
        externalId: rootDirectory,
        externalDisplayName,
      },
      select: { id: true },
    });
  }

  async saveCredential(
    workspaceId: string,
    provider: SourceProvider,
    credential: {
      externalId: string;
      externalDisplayName: string;
      externalUserId: string | null;
      externalUserEmail: string | null;
      encryptedAccessToken: string;
      encryptedRefreshToken: string | null;
      expiresAt: Date | null;
      scope: string | null;
    },
  ): Promise<{ id: string }> {
    const { externalId, ...values } = credential;

    return this.prisma.sourceCredential.upsert({
      where: {
        workspaceId_provider_externalId: { workspaceId, provider, externalId },
      },
      create: { workspaceId, provider, externalId, ...values, status: "active" },
      update: { ...values, status: "active" },
      select: { id: true },
    });
  }

  /** Return the OAuth source for one provider resource, and create it when it is absent. */
  async saveOAuthSource(
    workspaceId: string,
    provider: SourceProvider,
    credentialId: string,
    resource: {
      externalId: string;
      externalDisplayName: string;
      config: Record<string, unknown>;
    },
  ): Promise<{ id: string }> {
    const existing = await this.prisma.source.findFirst({
      where: { workspaceId, provider, externalId: resource.externalId },
      select: { id: true },
    });
    if (existing !== null) {
      return this.prisma.source.update({
        where: { id: existing.id },
        data: {
          credentialId,
          externalDisplayName: resource.externalDisplayName,
          // The OAuth client builds this object from the provider response, so every value is JSON already.
          config: resource.config as Prisma.InputJsonObject,
          status: "active",
        },
        select: { id: true },
      });
    }

    return this.prisma.source.create({
      data: {
        workspaceId,
        provider,
        credentialId,
        externalId: resource.externalId,
        externalDisplayName: resource.externalDisplayName,
        config: resource.config as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
  }

  /** Delete one source of this workspace. The database cascade removes its documents and their chunks. */
  async deleteSource(workspaceId: string, sourceId: string): Promise<number> {
    const deletion = await this.prisma.source.deleteMany({
      where: { id: sourceId, workspaceId },
    });

    return deletion.count;
  }

  /** Return one source of this workspace, or null. `externalId` is the root directory of a filesystem source. */
  async findSource(
    workspaceId: string,
    sourceId: string,
  ): Promise<{ provider: SourceProvider; externalId: string } | null> {
    return this.prisma.source.findFirst({
      where: { id: sourceId, workspaceId },
      select: { provider: true, externalId: true },
    });
  }

  /**
   * Return one document of one source of this workspace, or null.
   *
   * `externalId` on the document is the id the source assigns, and `externalId` on the source is the root
   * directory of a filesystem source. One query carries both, so no source can change between two reads.
   */
  async findDocument(
    workspaceId: string,
    sourceId: string,
    documentId: string,
  ): Promise<{
    externalId: string;
    source: { provider: SourceProvider; externalId: string };
  } | null> {
    return this.prisma.document.findFirst({
      where: { id: documentId, sourceId, source: { workspaceId } },
      select: {
        externalId: true,
        source: { select: { provider: true, externalId: true } },
      },
    });
  }

  /** Delete one document of one source of this workspace. The database cascade removes its chunks. */
  async deleteDocument(
    workspaceId: string,
    sourceId: string,
    documentId: string,
  ): Promise<void> {
    await this.prisma.document.deleteMany({
      where: { id: documentId, sourceId, source: { workspaceId } },
    });
  }
}
