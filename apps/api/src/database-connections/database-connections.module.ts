/**
 * This module owns every business database that a workspace registers for the agent to query.
 *
 * It lists the connections, checks that credentials open a connection before it stores one with its password
 * encrypted, checks a stored connection again on request, and deletes one. Every check stamps `status` and
 * `lastCheckedAt` on the row, so the browser can show a connection that stopped answering as inactive.
 * DatabaseConnectionPool holds one pg.Pool per connection and runs every statement read-only.
 * ToolsModule imports this module, so `list_databases`, `list_tables`, `describe_tables` and `execute_sql` reach the same pool that the
 * test route uses. The credentials the workspace registers must name a read-only role: that role, not this
 * module, is what stops the agent from writing.
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EncryptionModule } from "../encryption/encryption.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { DatabaseConnectionPool } from "./database-connection.pool.js";
import { DatabaseConnectionRepository } from "./database-connection.repository.js";
import { DatabaseConnectionsController } from "./database-connections.controller.js";
import { DatabaseConnectionsService } from "./database-connections.service.js";

@Module({
  imports: [AuthModule, EncryptionModule, PrismaModule],
  controllers: [DatabaseConnectionsController],
  providers: [
    DatabaseConnectionPool,
    DatabaseConnectionRepository,
    DatabaseConnectionsService,
  ],
  exports: [DatabaseConnectionsService],
})
export class DatabaseConnectionsModule {}
