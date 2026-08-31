import { Injectable } from "@nestjs/common";

import { SourceProvider } from "../generated/prisma/enums.js";

import {
  ConfluenceConnector,
  type ConfluenceConnectorOptions,
} from "./confluence.connector.js";
import type { DocumentConnector } from "./connector.types.js";
import {
  NotionConnector,
  type NotionConnectorOptions,
} from "./notion.connector.js";
import {
  UploadConnector,
  type UploadConnectorOptions,
} from "./upload.connector.js";
import { UploadedFileRepository } from "./uploaded-file.repository.js";

type ConnectorOptions =
  | (ConfluenceConnectorOptions & {
      provider: typeof SourceProvider.confluence;
    })
  | (NotionConnectorOptions & {
      provider: typeof SourceProvider.notion;
    })
  | (UploadConnectorOptions & {
      provider: typeof SourceProvider.upload;
    });

@Injectable()
export class ConnectorFactory {
  constructor(private readonly uploadedFileRepository: UploadedFileRepository) {}

  createConnector(options: ConnectorOptions): DocumentConnector {
    switch (options.provider) {
      case SourceProvider.confluence:
        return new ConfluenceConnector(options);
      case SourceProvider.notion:
        return new NotionConnector(options);
      case SourceProvider.upload:
        return new UploadConnector(options, this.uploadedFileRepository);
    }
  }
}
