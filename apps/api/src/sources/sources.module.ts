/**
 * This module is the HTTP surface over the sources of the workspace.
 *
 * It lists sources and their documents, stores uploaded files and syncs them, runs a sync pass on
 * demand, deletes one uploaded file, deletes a source with the files uploaded to it, and carries the OAuth
 * grant of a provider from the authorize URL to the stored credential. Every sync pass runs through
 * SyncModule, so this module owns no ingestion logic.
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AppConfigModule } from "../config/app-config.module.js";
import { ConnectorModule } from "../connectors/connector.module.js";
import { EncryptionModule } from "../encryption/encryption.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { SyncModule } from "../sync/sync.module.js";

import { SourceRepository } from "./source.repository.js";
import { SourcesController } from "./sources.controller.js";
import { SourcesService } from "./sources.service.js";

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    ConnectorModule,
    EncryptionModule,
    PrismaModule,
    SyncModule,
  ],
  controllers: [SourcesController],
  providers: [SourceRepository, SourcesService],
})
export class SourcesModule {}
