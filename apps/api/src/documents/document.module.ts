import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";

import { DocumentRepository } from "./document.repository.js";
import { SourceSyncRepository } from "./source-sync.repository.js";

@Module({
  imports: [PrismaModule],
  providers: [SourceSyncRepository, DocumentRepository],
  exports: [SourceSyncRepository, DocumentRepository],
})
export class DocumentModule {}
