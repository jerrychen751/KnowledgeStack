import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Client, Pool, type PoolClient } from "pg";

import { DatabaseEngine } from "../generated/prisma/enums.js";

/** How to reach one business database. `password` arrives decrypted, so no caller may log this object. */
export type ConnectionSettings = {
  id: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

/** One result set, with every value already rendered as text. A null value renders as an empty string. */
export type SqlRows = {
  columns: string[];
  rows: string[][];
};

/** The connection did not open, so the fault is the host, the port, the database name, or the credentials, and never the statement. A statement that fails after the connection opens throws the driver error itself. */
export class ConnectionFailedError extends Error {}

/**
 * One pg.Pool per database connection, held for the life of the process.
 *
 * Every statement runs inside `BEGIN READ ONLY`, with a sixty second statement timeout, whatever grants the
 * connected role holds. The transaction declares the mode, because one
 * `SELECT set_config('default_transaction_read_only','off',false)` turns the session default off, and the
 * pool hands that same session to a later query. The read-only role the workspace registers is the wall
 * that matters, and these two are the second one.
 */
@Injectable()
export class DatabaseConnectionPool implements OnModuleDestroy {
  private readonly poolsByConnectionId = new Map<string, Pool>();

  private readPool(settings: ConnectionSettings): Pool {
    if (settings.engine !== DatabaseEngine.POSTGRESQL) {
      throw new Error(`The ${settings.engine} database engine has no query driver.`);
    }

    const held = this.poolsByConnectionId.get(settings.id);
    if (held !== undefined) {
      return held;
    }

    const pool = new Pool({
      host: settings.host,
      port: settings.port,
      database: settings.database,
      user: settings.username,
      password: settings.password,
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      options: "-c default_transaction_read_only=on -c statement_timeout=60000",
    });
    pool.on("error", () => {});
    this.poolsByConnectionId.set(settings.id, pool);

    return pool;
  }

  /**
   * Open one connection with these credentials, then close it.
   *
   * Throws ConnectionFailedError when the connection does not open. It builds no pool and reads no pool, so
   * a caller may check credentials that no row holds yet, and credentials that replace the ones a held pool
   * still carries.
   */
  async checkConnection(settings: Omit<ConnectionSettings, "id">): Promise<void> {
    if (settings.engine !== DatabaseEngine.POSTGRESQL) {
      throw new ConnectionFailedError(`The ${settings.engine} database engine has no query driver.`);
    }

    const client = new Client({
      host: settings.host,
      port: settings.port,
      database: settings.database,
      user: settings.username,
      password: settings.password,
      connectionTimeoutMillis: 5_000,
    });
    try {
      await client.connect();
    } catch (error) {
      throw new ConnectionFailedError(
        error instanceof Error ? error.message : "The connection did not open.",
      );
    }

    await client.end();
  }

  /**
   * Run one statement and return its rows. `params` fills the `$1` and `$2` placeholders of the statement.
   *
   * Throws ConnectionFailedError when the connection does not open, and the error the driver reports when the
   * statement fails. Both messages name the fault the person must fix, such as
   * `password authentication failed for user "agent_readonly"`, so a caller may show either one.
   */
  async executeSql(
    settings: ConnectionSettings,
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlRows> {
    let client: PoolClient;
    try {
      client = await this.readPool(settings).connect();
    } catch (error) {
      throw new ConnectionFailedError(
        error instanceof Error ? error.message : "The connection did not open.",
      );
    }

    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query({ text: sql, values: [...params], rowMode: "array" });
      const rows = (result.rows as unknown[][]).map((row) =>
        row.map((value) => {
          if (value === null || value === undefined) {
            return "";
          }
          if (value instanceof Date) {
            return value.toISOString();
          }
          if (typeof value === "object") {
            return JSON.stringify(value);
          }

          return String(value);
        }),
      );

      await client.query("COMMIT");
      return { columns: result.fields.map((field) => field.name), rows };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /** Close and drop the pool of one connection. Call it after the row changes or after the row is deleted. */
  async closePool(databaseConnectionId: string): Promise<void> {
    const pool = this.poolsByConnectionId.get(databaseConnectionId);
    if (pool === undefined) {
      return;
    }

    this.poolsByConnectionId.delete(databaseConnectionId);
    await pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    const pools = [...this.poolsByConnectionId.values()];
    this.poolsByConnectionId.clear();
    await Promise.all(pools.map((pool) => pool.end()));
  }
}
