/**
 * This module handles communication with source providers (Notion, Confluence, uploads).
 *
 * This module constructs connectors from a complete set of connector options (which varies depending on the source provider). It contains logic to interact with the source providers, and it owns UploadedFileRepository because the upload provider is a table in this database; options are resolved through the database, which is handled by connector resolver in sync service.
 */

import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";

import { ConnectorFactory } from "./connector.factory.js";
import { UploadedFileRepository } from "./uploaded-file.repository.js";

@Module({
  imports: [PrismaModule],
  providers: [ConnectorFactory, UploadedFileRepository],
  exports: [ConnectorFactory, UploadedFileRepository],
})
export class ConnectorModule {}
