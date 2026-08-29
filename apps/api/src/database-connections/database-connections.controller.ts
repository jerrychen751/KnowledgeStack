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

import type {
  CreateDatabaseConnectionRequest,
  CreateDatabaseConnectionResponse,
  ListDatabaseConnectionsResponse,
  TestDatabaseConnectionResponse,
} from "@knowledgestack/shared/database-connections";
import type { StatusResponse } from "@knowledgestack/shared/http";

import { ActiveWorkspaceId } from "../auth/session.decorator.js";
import { DatabaseEngine } from "../generated/prisma/enums.js";

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

  private readText(body: Record<string, unknown>, field: string, maxLength: number): string {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new BadRequestException(`${field} must be a non-empty string.`);
    }
    if (value.length > maxLength) {
      throw new BadRequestException(`${field} must hold ${maxLength} characters or fewer.`);
    }

    return value.trim();
  }

  private readCreateRequest(body: unknown): CreateDatabaseConnectionRequest {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new BadRequestException("The body must be one JSON object.");
    }
    const fields = body as Record<string, unknown>;

    if (fields.engine !== DatabaseEngine.POSTGRESQL) {
      throw new BadRequestException('engine must be "POSTGRESQL".');
    }
    const port = Number(fields.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new BadRequestException("port must be an integer from 1 through 65535.");
    }
    const password = fields.password;
    if (typeof password !== "string" || password === "") {
      throw new BadRequestException("password must be a non-empty string.");
    }
    if (password.length > 255) {
      throw new BadRequestException("password must hold 255 characters or fewer.");
    }

    return {
      name: this.readText(fields, "name", 60),
      description: this.readText(fields, "description", 500),
      engine: DatabaseEngine.POSTGRESQL,
      host: this.readText(fields, "host", 255),
      port,
      database: this.readText(fields, "database", 63),
      username: this.readText(fields, "username", 63),
      password,
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
    return this.databaseConnectionsService.createDatabaseConnection(
      workspaceId,
      this.readCreateRequest(body),
    );
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
