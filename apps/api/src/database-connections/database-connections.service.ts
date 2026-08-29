import { Injectable, NotFoundException } from "@nestjs/common";

import type {
  CreateDatabaseConnectionRequest,
  CreateDatabaseConnectionResponse,
  DatabaseConnection,
  TestDatabaseConnectionResponse,
} from "@knowledgestack/api-contract/database-connections";

import { EncryptionService } from "../encryption/encryption.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { DatabaseConnectionStatus } from "../generated/prisma/enums.js";

import {
  type ConnectionSettings,
  ConnectionFailedError,
  DatabaseConnectionPool,
  type SqlRows,
} from "./database-connection.pool.js";
import { DatabaseConnectionRepository } from "./database-connection.repository.js";

type DatabaseConnectionRow = Omit<DatabaseConnection, "createdAt" | "lastCheckedAt"> & {
  createdAt: Date;
  lastCheckedAt: Date;
};

@Injectable()
export class DatabaseConnectionsService {
  constructor(
    private readonly databaseConnectionPool: DatabaseConnectionPool,
    private readonly databaseConnectionRepository: DatabaseConnectionRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  // Turn a stored database connection from app database format to JSON format (date becomes ISO string)
  private describeConnection(connection: DatabaseConnectionRow): DatabaseConnection {
    return {
      id: connection.id,
      name: connection.name,
      description: connection.description,
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      status: connection.status,
      lastCheckedAt: connection.lastCheckedAt.toISOString(),
      createdAt: connection.createdAt.toISOString(),
    };
  }

  async listDatabaseConnections(workspaceId: string): Promise<DatabaseConnection[]> {
    const connections = await this.databaseConnectionRepository.listDatabaseConnections(workspaceId);
    return connections.map((connection) => this.describeConnection(connection));
  }

  /** Open a connection with these credentials and close it. Returns an empty string when it opened, and the text the driver reported when it did not. */
  private async checkConnection(settings: Omit<ConnectionSettings, "id">): Promise<string> {
    try {
      await this.databaseConnectionPool.checkConnection(settings);
    } catch (error) {
      return error instanceof Error ? error.message : "The connection did not open.";
    }

    return "";
  }

  /**
   * Register one database under the name the request gives, once the submitted credentials open a connection.
   *
   * The API stores no row that never connected, so a check that fails on a name the workspace does not hold
   * leaves the table untouched and the response carries no connection. The same name sent again corrects the
   * stored credentials, and the check runs before the write there too: a check that fails leaves the stored
   * credentials as they are, and the response carries that unchanged row so the browser can show its status.
   *
   * Two requests can read the same free name and both reach the insert, because the credential check between
   * the read and the write takes up to five seconds. The unique index over the workspace and the name rejects
   * the second insert, and this method reports that as a failure the person can act on.
   */
  async createDatabaseConnection(
    workspaceId: string,
    request: CreateDatabaseConnectionRequest,
  ): Promise<CreateDatabaseConnectionResponse> {
    const held = await this.databaseConnectionRepository.readConnectionRow(workspaceId, {
      name: request.name,
    });

    const message = await this.checkConnection({
      engine: request.engine,
      host: request.host,
      port: request.port,
      database: request.database,
      username: request.username,
      password: request.password,
    });
    if (message !== "") {
      return {
        success: false,
        message,
        databaseConnection: held === null ? null : this.describeConnection(held),
      };
    }

    const fields = {
      description: request.description,
      engine: request.engine,
      host: request.host,
      port: request.port,
      database: request.database,
      username: request.username,
      encryptedPassword: this.encryptionService.encrypt(request.password),
    };
    if (held === null) {
      try {
        const created = await this.databaseConnectionRepository.createDatabaseConnection(
          workspaceId,
          { name: request.name, ...fields },
        );

        return { success: true, databaseConnection: this.describeConnection(created) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }

        return {
          success: false,
          message: `This workspace already holds a database named ${request.name}. Send it again to correct the stored credentials.`,
          databaseConnection: null,
        };
      }
    }

    const updated = await this.databaseConnectionRepository.updateDatabaseConnection(
      held.id,
      fields,
    );
    await this.databaseConnectionPool.closePool(held.id);

    return { success: true, databaseConnection: this.describeConnection(updated) };
  }

  /** Delete one connection and close the pool it held. Throws NotFoundException when the workspace holds no such connection. */
  async deleteDatabaseConnection(
    workspaceId: string,
    databaseConnectionId: string,
  ): Promise<void> {
    const isDeleted = await this.databaseConnectionRepository.deleteDatabaseConnection(
      workspaceId,
      databaseConnectionId,
    );
    if (!isDeleted) {
      throw new NotFoundException("This workspace holds no database connection with that id.");
    }

    await this.databaseConnectionPool.closePool(databaseConnectionId);
  }

  /**
   * Resolve one connection to the settings the pool needs, with the password decrypted and the stored status.
   *
   * Throws NotFoundException when the workspace holds no such connection, and an Error when the stored
   * password does not decrypt with the current TOKEN_ENCRYPTION_KEY.
   */
  private async readConnectionSettings(
    workspaceId: string,
    key: { databaseConnectionId: string } | { name: string },
  ): Promise<ConnectionSettings & { status: DatabaseConnectionStatus }> {
    const connection = await this.databaseConnectionRepository.readConnectionRow(workspaceId, key);
    if (connection === null) {
      throw new NotFoundException(
        "name" in key
          ? `This workspace holds no database named ${key.name}.`
          : "This workspace holds no database connection with that id.",
      );
    }

    return {
      id: connection.id,
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: this.encryptionService.decrypt(connection.encryptedPassword),
      status: connection.status,
    };
  }

  /** Check the stored credentials, stamp the outcome on the row, and answer with the refreshed row. It reports a failure instead of throwing it. */
  async testDatabaseConnection(
    workspaceId: string,
    databaseConnectionId: string,
  ): Promise<TestDatabaseConnectionResponse> {
    const settings = await this.readConnectionSettings(workspaceId, { databaseConnectionId });
    const message = await this.checkConnection(settings);
    const checked = await this.databaseConnectionRepository.recordConnectionCheck(
      databaseConnectionId,
      message === "",
    );

    return { databaseConnection: this.describeConnection(checked), message };
  }

  /**
   * Run one statement against the database the workspace registered under `name`, and return its rows.
   * `params` fills the `$1` and `$2` placeholders, so a caller never concatenates a value into the statement.
   *
   * The caller must check the statement first when a model wrote it. This method runs whatever it receives,
   * inside the read-only transaction and the sixty second timeout the pool sets. It stamps the row only when
   * a success follows a stored error, so a working connection writes nothing. A connection failure stamps the
   * row every time, so `lastCheckedAt` reports how recent the failure is. A statement that fails after the
   * connection opens leaves the status active.
   */
  async executeSql(
    workspaceId: string,
    name: string,
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlRows> {
    const settings = await this.readConnectionSettings(workspaceId, { name });
    try {
      const rows = await this.databaseConnectionPool.executeSql(settings, sql, params);
      if (settings.status !== DatabaseConnectionStatus.active) {
        await this.databaseConnectionRepository.recordConnectionCheck(settings.id, true);
      }

      return rows;
    } catch (error) {
      if (error instanceof ConnectionFailedError) {
        await this.databaseConnectionRepository.recordConnectionCheck(settings.id, false);
      }

      throw error;
    }
  }
}
