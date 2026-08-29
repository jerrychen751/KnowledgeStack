/**
 * Root module connecting feature modules, where each module performs composition of components
 * (controller, service, repository).
 */

import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SourcesModule } from "./sources/sources.module.js";
import { SyncModule } from "./sync/sync.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    ChatModule,
    PrismaModule,
    SourcesModule,
    SyncModule,
    WorkspacesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
