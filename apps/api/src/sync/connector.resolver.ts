import { Injectable } from "@nestjs/common";

import { TokenService } from "../auth/token.service.js";
import { ConnectorFactory } from "../connectors/connector.factory.js";
import type { DocumentConnector } from "../connectors/connector.types.js";
import { DocumentSourceRepository } from "../documents/document-source.repository.js";
import { DocumentSourceProvider } from "../generated/prisma/enums.js";

@Injectable()
export class ConnectorResolver {
  constructor(
    private readonly documentSourceRepository: DocumentSourceRepository,
    private readonly tokenService: TokenService,
    private readonly connectorFactory: ConnectorFactory,
  ) {}

  async resolveConnector(
    documentSourceId: string,
  ): Promise<DocumentConnector> {
    const documentSource =
      await this.documentSourceRepository.findConnectorProviderInfoById(
        documentSourceId,
      );

    switch (documentSource.provider) {
      case DocumentSourceProvider.notion: {
        const accessToken =
          await this.tokenService.getAccessToken(documentSourceId);
        return this.connectorFactory.createConnector({
          provider: documentSource.provider,
          accessToken,
        });
      }
      case DocumentSourceProvider.confluence: {
        const accessToken =
          await this.tokenService.getAccessToken(documentSourceId);
        return this.connectorFactory.createConnector({
          provider: documentSource.provider,
          accessToken,
          cloudId: documentSource.cloudId,
          siteUrl: documentSource.siteUrl,
          spaceIds: [documentSource.spaceId],
        });
      }
      case DocumentSourceProvider.filesystem:
        return this.connectorFactory.createConnector({
          provider: documentSource.provider,
          rootDirectory: documentSource.rootDirectory,
        });
    }
  }
}
