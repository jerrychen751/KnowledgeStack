import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { SourceProvider } from "../generated/prisma/enums.js";

type ConnectorSettings =
  | {
      id: string;
      provider: typeof SourceProvider.notion;
      externalWorkspaceId: string;
    }
  | {
      id: string;
      provider: typeof SourceProvider.confluence;
      cloudId: string;
      siteUrl: string;
      spaceId: string;
    }
  | {
      id: string;
      provider: typeof SourceProvider.filesystem;
      rootDirectory: string;
    };

@Injectable()
export class SourceSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConnectorSettings(
    sourceId: string,
  ): Promise<ConnectorSettings> {
    const source = await this.prisma.source.findUniqueOrThrow({
      where: { id: sourceId },
      select: {
        id: true,
        provider: true,
        externalId: true,
        externalSpaceId: true,
        config: true,
      },
    });

    switch (source.provider) {
      case SourceProvider.notion:
        return {
          id: source.id,
          provider: source.provider,
          externalWorkspaceId: source.externalId,
        };
      case SourceProvider.confluence:
        if (source.externalSpaceId === null) {
          throw new TypeError(
            `The Confluence source ${source.id} has no space id.`,
          );
        }
        return {
          id: source.id,
          provider: source.provider,
          cloudId: source.externalId,
          siteUrl: this.readConfluenceSiteUrl(
            source.id,
            source.config,
          ),
          spaceId: source.externalSpaceId,
        };
      case SourceProvider.filesystem:
        return {
          id: source.id,
          provider: source.provider,
          rootDirectory: source.externalId,
        };
    }
  }

  private readConfluenceSiteUrl(
    sourceId: string,
    config: unknown,
  ): string {
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
      throw new TypeError(
        `The Confluence source ${sourceId} has an invalid config object.`,
      );
    }

    const siteUrl = (config as Record<string, unknown>).siteUrl;
    if (typeof siteUrl !== "string" || siteUrl.trim() === "") {
      throw new TypeError(
        `The Confluence source ${sourceId} has no site URL.`,
      );
    }

    let parsedSiteUrl: URL;
    try {
      parsedSiteUrl = new URL(siteUrl);
    } catch {
      throw new TypeError(
        `The Confluence source ${sourceId} has an invalid site URL.`,
      );
    }
    if (parsedSiteUrl.protocol !== "https:") {
      throw new TypeError(
        `The Confluence source ${sourceId} must use an HTTPS site URL.`,
      );
    }

    return siteUrl;
  }

  async recordSyncCompletion(
    sourceId: string,
    syncStartedAt: Date,
  ): Promise<void> {
    const update = await this.prisma.source.updateMany({
      where: {
        id: sourceId,
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: syncStartedAt } },
        ],
      },
      data: { lastSyncedAt: syncStartedAt },
    });
    if (update.count === 0) {
      await this.prisma.source.findUniqueOrThrow({
        where: { id: sourceId },
        select: { id: true },
      });
    }
  }
}
