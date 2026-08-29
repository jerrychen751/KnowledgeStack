/**
 * This module resolves the workspace that owns the stored documents.
 *
 * A person signs in with Google, then creates a workspace or joins one with its code. The session row
 * carries the workspace the browser reads, and every document route works inside that one workspace.
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspacesService } from "./workspaces.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
