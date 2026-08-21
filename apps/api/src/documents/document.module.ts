import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";

import { DocumentRepository } from "./document.repository.js";
import { SourceSyncRepository } from "./source-sync.repository.js";

@Module({
  imports: [DatabaseModule],
  providers: [SourceSyncRepository, DocumentRepository],
  exports: [SourceSyncRepository, DocumentRepository],
})
export class DocumentModule {}
