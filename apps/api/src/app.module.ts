/**
 * Root module connecting feature modules, where each module performs composition of components
 * (controller, service, repository).
 */

import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { SyncModule } from "./sync/sync.module.js";

@Module({
  imports: [DatabaseModule, SyncModule],
  controllers: [HealthController],
})
export class AppModule {}
