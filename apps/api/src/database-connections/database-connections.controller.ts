import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";

import {
  createDatabaseConnectionRequestSchema,
  type CreateDatabaseConnectionResponse,
  type ListDatabaseConnectionsResponse,
  type TestDatabaseConnectionResponse,
} from "@knowledgestack/api-contract/database-connections";
import type { StatusResponse } from "@knowledgestack/api-contract/http";

import { ActiveWorkspaceId } from "../auth/session.decorator.js";

import { DatabaseConnectionsService } from "./database-connections.service.js";

@Controller("database-connections")
export class DatabaseConnectionsController {
  constructor(private readonly databaseConnectionsService: DatabaseConnectionsService) {}

  @Get()
  async listDatabaseConnections(
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<ListDatabaseConnectionsResponse> {
    return {
      databaseConnections: await this.databaseConnectionsService.listDatabaseConnections(workspaceId),
    };
  }

  /**
   * Register one business database. Give the credentials of a read-only role, because that role stops every
   * write. The description must say what the database holds, because the agent chooses a database by it. The
   * route checks the credentials before it writes, and stores nothing when they do not open a connection.
   * Send the same name again to correct the credentials and the description of a connection the workspace holds.
   */
  @Post()
  @HttpCode(200)
  async createDatabaseConnection(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<CreateDatabaseConnectionResponse> {
    const parsed = createDatabaseConnectionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    return this.databaseConnectionsService.createDatabaseConnection(workspaceId, parsed.data);
  }

  /** Open a connection with the stored credentials and close it. A connection that fails answers 200 with the driver message. */
  @Post(":databaseConnectionId/test")
  @HttpCode(200)
  async testDatabaseConnection(
    @Param("databaseConnectionId") databaseConnectionId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<TestDatabaseConnectionResponse> {
    return this.databaseConnectionsService.testDatabaseConnection(
      workspaceId,
      databaseConnectionId,
    );
  }

  @Delete(":databaseConnectionId")
  @HttpCode(200)
  async deleteDatabaseConnection(
    @Param("databaseConnectionId") databaseConnectionId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<StatusResponse> {
    await this.databaseConnectionsService.deleteDatabaseConnection(
      workspaceId,
      databaseConnectionId,
    );

    return { status: "ok" };
  }
}
