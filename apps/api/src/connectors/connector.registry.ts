import { Injectable } from "@nestjs/common";

import { DocumentSourceProvider } from "../generated/prisma/enums.js";

import { ConfluenceConnector, type ConfluenceConnectorOptions } from "./confluence.connector.js";
import type { DocumentConnector } from "./connector.types.js";
import { FileSystemConnector, type FileSystemConnectorOptions } from "./filesystem.connector.js";
import { NotionConnector, type NotionConnectorOptions } from "./notion.connector.js";

export type ConnectorOptions =
  | (ConfluenceConnectorOptions & { provider: typeof DocumentSourceProvider.confluence })
  | (FileSystemConnectorOptions & { provider: typeof DocumentSourceProvider.filesystem })
  | (NotionConnectorOptions & { provider: typeof DocumentSourceProvider.notion });

@Injectable()
export class ConnectorRegistry {
  createConnector(options: ConnectorOptions): DocumentConnector {
    switch (options.provider) {
      case DocumentSourceProvider.confluence:
        return new ConfluenceConnector(options);
      case DocumentSourceProvider.filesystem:
        return new FileSystemConnector(options);
      case DocumentSourceProvider.notion:
        return new NotionConnector(options);
    }
  }
}
