/**
 * 
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ConnectorModule } from "../connectors/connector.module.js";
import { DocumentModule } from "../documents/document.module.js";
import { EmbeddingModule } from "../embedding/embedding.module.js";

import { ConnectorResolver } from "./connector.resolver.js";
import { SyncService } from "./sync.service.js";

@Module({
  imports: [AuthModule, ConnectorModule, DocumentModule, EmbeddingModule],
  providers: [ConnectorResolver, SyncService],
  exports: [ConnectorResolver, SyncService],
})
export class SyncModule {}
