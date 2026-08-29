import { Injectable } from "@nestjs/common";

import { DatabaseConnectionStatus, type DatabaseEngine } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The columns every route may answer with. PrismaService omits `encryptedPassword` globally, so no read returns it by accident. */
const publicColumns = {
  id: true,
  name: true,
  description: true,
  engine: true,
  host: true,
  port: true,
  database: true,
  username: true,
  status: true,
  lastCheckedAt: true,
  createdAt: true,
} as const;

/** Every query the database connections API and the SQL tools make. */
@Injectable()
export class DatabaseConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listDatabaseConnections(workspaceId: string) {
    return this.prisma.databaseConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: publicColumns,
    });
  }

  /** Insert one connection. The caller must check the credentials first, because the row it writes carries the active status and the check time. */
  async createDatabaseConnection(
    workspaceId: string,
    databaseConnection: {
      name: string;
      description: string;
      engine: DatabaseEngine;
      host: string;
      port: number;
      database: string;
      username: string;
      encryptedPassword: string;
    },
  ) {
    return this.prisma.databaseConnection.create({
      data: {
        ...databaseConnection,
        workspaceId,
        status: DatabaseConnectionStatus.active,
        lastCheckedAt: new Date(),
      },
      select: publicColumns,
    });
  }

  /** Replace the credentials of one connection. The caller must check them first, because the row it writes carries the active status and the check time. */
  async updateDatabaseConnection(
    databaseConnectionId: string,
    databaseConnection: {
      description: string;
      engine: DatabaseEngine;
      host: string;
      port: number;
      database: string;
      username: string;
      encryptedPassword: string;
    },
  ) {
    return this.prisma.databaseConnection.update({
      where: { id: databaseConnectionId },
      data: {
        ...databaseConnection,
        status: DatabaseConnectionStatus.active,
        lastCheckedAt: new Date(),
      },
      select: publicColumns,
    });
  }

  /** Stamp the outcome of one check on the row, so a later read reports how the connection answered last. */
  async recordConnectionCheck(databaseConnectionId: string, isReachable: boolean) {
    return this.prisma.databaseConnection.update({
      where: { id: databaseConnectionId },
      data: {
        status: isReachable ? DatabaseConnectionStatus.active : DatabaseConnectionStatus.error,
        lastCheckedAt: new Date(),
      },
      select: publicColumns,
    });
  }

  /** Delete one connection of one workspace. Returns false when the workspace holds no connection with that id. */
  async deleteDatabaseConnection(
    workspaceId: string,
    databaseConnectionId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.databaseConnection.deleteMany({
      where: { id: databaseConnectionId, workspaceId },
    });

    return count > 0;
  }

  /**
   * Read one connection with the password column, by id or by the name the workspace gave it. Returns null
   * when the workspace holds no such connection. Never write the returned row to a log.
   */
  async readConnectionRow(
    workspaceId: string,
    key: { databaseConnectionId: string } | { name: string },
  ) {
    return this.prisma.databaseConnection.findFirst({
      where: {
        workspaceId,
        ...("name" in key ? { name: key.name } : { id: key.databaseConnectionId }),
      },
      omit: { encryptedPassword: false },
    });
  }
}
