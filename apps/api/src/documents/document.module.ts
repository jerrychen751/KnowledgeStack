import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";

import { DocumentSourceRepository } from "./document-source.repository.js";
import { DocumentRepository } from "./document.repository.js";

@Module({
  imports: [DatabaseModule],
  providers: [DocumentSourceRepository, DocumentRepository],
  exports: [DocumentSourceRepository, DocumentRepository],
})
export class DocumentModule {}
