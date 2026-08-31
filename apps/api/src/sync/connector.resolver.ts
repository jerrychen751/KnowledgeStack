import { Injectable } from "@nestjs/common";

import { TokenService } from "../auth/token.service.js";
import { ConnectorFactory } from "../connectors/connector.factory.js";
import type { DocumentConnector } from "../connectors/connector.types.js";
import { SourceSyncRepository } from "../documents/source-sync.repository.js";
import { SourceProvider } from "../generated/prisma/enums.js";

@Injectable()
export class ConnectorResolver {
  constructor(
    private readonly sourceSyncRepository: SourceSyncRepository,
    private readonly tokenService: TokenService,
    private readonly connectorFactory: ConnectorFactory,
  ) {}

  async resolveConnector(
    sourceId: string,
  ): Promise<DocumentConnector> {
    const settings = await this.sourceSyncRepository.findConnectorSettings(sourceId);

    switch (settings.provider) {
      case SourceProvider.notion: {
        const accessToken =
          await this.tokenService.getAccessToken(sourceId);
        return this.connectorFactory.createConnector({
          provider: settings.provider,
          accessToken,
        });
      }
      case SourceProvider.confluence: {
        const accessToken =
          await this.tokenService.getAccessToken(sourceId);
        return this.connectorFactory.createConnector({
          provider: settings.provider,
          accessToken,
          cloudId: settings.cloudId,
          siteUrl: settings.siteUrl,
          spaceIds: [settings.spaceId],
        });
      }
      case SourceProvider.upload:
        return this.connectorFactory.createConnector({
          provider: settings.provider,
          workspaceId: settings.workspaceId,
        });
    }
  }
}
