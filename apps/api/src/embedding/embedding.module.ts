import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module.js";

import { EmbeddingService } from "./embedding.service.js";

@Module({
  imports: [AppConfigModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
