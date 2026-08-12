import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { DocumentSourceProvider } from "../generated/prisma/enums.js";

type ConnectorProviderInfo =
  | {
      id: string;
      provider: typeof DocumentSourceProvider.notion;
      workspaceId: string;
    }
  | {
      id: string;
      provider: typeof DocumentSourceProvider.confluence;
      cloudId: string;
      siteUrl: string;
      spaceId: string;
    }
  | {
      id: string;
      provider: typeof DocumentSourceProvider.filesystem;
      rootDirectory: string;
    };

@Injectable()
export class DocumentSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConnectorProviderInfoById(
    documentSourceId: string,
  ): Promise<ConnectorProviderInfo> {
    const documentSource = await this.prisma.documentSource.findUniqueOrThrow({
      where: { id: documentSourceId },
      select: {
        id: true,
        provider: true,
        externalId: true,
        externalSpaceId: true,
        config: true,
      },
    });

    switch (documentSource.provider) {
      case DocumentSourceProvider.notion:
        return {
          id: documentSource.id,
          provider: documentSource.provider,
          workspaceId: documentSource.externalId,
        };
      case DocumentSourceProvider.confluence:
        if (documentSource.externalSpaceId === null) {
          throw new TypeError(
            `The Confluence source ${documentSource.id} has no space id.`,
          );
        }
        return {
          id: documentSource.id,
          provider: documentSource.provider,
          cloudId: documentSource.externalId,
          siteUrl: this.readConfluenceSiteUrl(
            documentSource.id,
            documentSource.config,
          ),
          spaceId: documentSource.externalSpaceId,
        };
      case DocumentSourceProvider.filesystem:
        return {
          id: documentSource.id,
          provider: documentSource.provider,
          rootDirectory: documentSource.externalId,
        };
    }
  }

  private readConfluenceSiteUrl(
    documentSourceId: string,
    config: unknown,
  ): string {
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
      throw new TypeError(
        `The Confluence source ${documentSourceId} has an invalid config object.`,
      );
    }

    const siteUrl = (config as Record<string, unknown>).siteUrl;
    if (typeof siteUrl !== "string" || siteUrl.trim() === "") {
      throw new TypeError(
        `The Confluence source ${documentSourceId} has no site URL.`,
      );
    }

    let parsedSiteUrl: URL;
    try {
      parsedSiteUrl = new URL(siteUrl);
    } catch {
      throw new TypeError(
        `The Confluence source ${documentSourceId} has an invalid site URL.`,
      );
    }
    if (parsedSiteUrl.protocol !== "https:") {
      throw new TypeError(
        `The Confluence source ${documentSourceId} must use an HTTPS site URL.`,
      );
    }

    return siteUrl;
  }

  async recordSyncCompletion(
    documentSourceId: string,
    syncStartedAt: Date,
  ): Promise<void> {
    const update = await this.prisma.documentSource.updateMany({
      where: {
        id: documentSourceId,
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: syncStartedAt } },
        ],
      },
      data: { lastSyncedAt: syncStartedAt },
    });
    if (update.count === 0) {
      await this.prisma.documentSource.findUniqueOrThrow({
        where: { id: documentSourceId },
        select: { id: true },
      });
    }
  }
}
