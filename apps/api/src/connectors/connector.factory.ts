import { Injectable } from "@nestjs/common";

import { SourceProvider } from "../generated/prisma/enums.js";

import {
  ConfluenceConnector,
  type ConfluenceConnectorOptions,
} from "./confluence.connector.js";
import type { DocumentConnector } from "./connector.types.js";
import {
  FilesystemConnector,
  type FilesystemConnectorOptions,
} from "./filesystem.connector.js";
import {
  NotionConnector,
  type NotionConnectorOptions,
} from "./notion.connector.js";

type ConnectorOptions =
  | (ConfluenceConnectorOptions & {
      provider: typeof SourceProvider.confluence;
    })
  | (FilesystemConnectorOptions & {
      provider: typeof SourceProvider.filesystem;
    })
  | (NotionConnectorOptions & {
      provider: typeof SourceProvider.notion;
    });

@Injectable()
export class ConnectorFactory {
  createConnector(options: ConnectorOptions): DocumentConnector {
    switch (options.provider) {
      case SourceProvider.confluence:
        return new ConfluenceConnector(options);
      case SourceProvider.filesystem:
        return new FilesystemConnector(options);
      case SourceProvider.notion:
        return new NotionConnector(options);
    }
  }
}
