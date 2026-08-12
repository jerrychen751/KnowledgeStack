import { Injectable } from "@nestjs/common";

import { DocumentSourceProvider } from "../generated/prisma/enums.js";

import {
  ConfluenceConnector,
  type ConfluenceConnectorOptions,
} from "./connector.confluence.js";
import type { DocumentConnector } from "./connector.types.js";
import {
  FileSystemConnector,
  type FileSystemConnectorOptions,
} from "./connector.filesystem.js";
import {
  NotionConnector,
  type NotionConnectorOptions,
} from "./connector.notion.js";

type ConnectorOptions =
  | (ConfluenceConnectorOptions & {
      provider: typeof DocumentSourceProvider.confluence;
    })
  | (FileSystemConnectorOptions & {
      provider: typeof DocumentSourceProvider.filesystem;
    })
  | (NotionConnectorOptions & {
      provider: typeof DocumentSourceProvider.notion;
    });

@Injectable()
export class ConnectorFactory {
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
