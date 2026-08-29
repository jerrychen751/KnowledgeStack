import { Injectable } from "@nestjs/common";

import type { SqlRows } from "../database-connections/database-connection.pool.js";
import { DatabaseConnectionsService } from "../database-connections/database-connections.service.js";

import { Tool } from "./tool.registry.js";
import type { ToolSession } from "./tool.session.js";

@Injectable()
export class DatabaseTools {
  constructor(private readonly connectionsService: DatabaseConnectionsService) {}

  private readName(args: Record<string, unknown>): string {
    const database = args.database;
    return typeof database === "string" ? database.trim() : "";
  }

  private readFailure(error: unknown): string {
    return error instanceof Error
      ? error.message.replace(/\.$/, "")
      : "the database gave no reason";
  }

  private cutToBudget(text: string, characterBudget: number, advice: string): string {
    if (text.length <= characterBudget) {
      return text;
    }

    return `${text.slice(0, characterBudget)}\n\nThe rest is cut. ${advice}`;
  }

  private renderRows(result: SqlRows): string[] {
    return [
      result.columns.join(" | "),
      ...result.rows.map((row) =>
        row.map((cell) => (cell.length <= 200 ? cell : `${cell.slice(0, 200)}...`)).join(" | "),
      ),
    ];
  }

  /**
   * Report every database the workspace registered, with the description a person wrote for it.
   *
   * A database of 50 tables or fewer reports its table names here, so a small workspace reaches a statement
   * without a second call. A larger one reports only how many tables it holds. A database that does not
   * answer reports the driver message on its own line, so one dead connection never hides the others.
   */
  @Tool({
    name: "list_databases",
    description:
      "List the databases of the workspace, what each one holds, and how many tables it has. Call this first.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    buildDisplayText: () => "listed the databases",
  })
  async listDatabases(session: ToolSession): Promise<string> {
    const databaseConnections = await this.connectionsService.listDatabaseConnections(
      session.workspaceId,
    );
    if (databaseConnections.length === 0) {
      return "This workspace has registered no database. Answer from the documents alone.";
    }

    const listed = await Promise.all(
      databaseConnections.map(async (databaseConnection) => {
        const description =
          databaseConnection.description === "" ? "" : ` ${databaseConnection.description}`;
        try {
          const tables = await this.connectionsService.executeSql(
            session.workspaceId,
            databaseConnection.name,
            `SELECT count(*) OVER () AS "tableCount", table_name AS "tableName"
             FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             ORDER BY table_name
             LIMIT 50`,
          );

          const tableCount = tables.rows.length === 0 ? 0 : Number(tables.rows[0][0]);
          const tableNames = tables.rows.map((row) => row[1]);
          const held =
            tableCount <= tableNames.length
              ? `${tableCount} tables: ${tableNames.join(", ")}`
              : `${tableCount} tables. Call list_tables to read the names.`;

          return `${databaseConnection.name}:${description} ${held}`;
        } catch (error) {
          return `${databaseConnection.name}:${description} unreachable, because ${this.readFailure(error)}.`;
        }
      }),
    );

    return this.cutToBudget(
      `The workspace registered these databases.\n${listed.join("\n")}`,
      6_000,
      "Call list_tables for one database.",
    );
  }

  /**
   * Report the tables of one database, one line each, with the table comment and the row estimate.
   *
   * `nameFilter` matches any part of a table name, so a database of thousands of tables still answers in a
   * few lines. The row estimate comes from `pg_class.reltuples`, which the planner keeps, so it costs no
   * scan and reads `unknown` until the table is analyzed once.
   */
  @Tool({
    name: "list_tables",
    description:
      "List the tables of one registered database, with the table comment and the row estimate. Filter by name when the database holds many tables.",
    parameters: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "The name of one registered database, as list_databases reported it.",
        },
        nameFilter: {
          type: ["string", "null"],
          description:
            "Report only the tables whose name holds this text, such as `invc`. Send null to report every table.",
        },
      },
      required: ["database", "nameFilter"],
      additionalProperties: false,
    },
    buildDisplayText: (args) =>
      `listed the tables of ${typeof args.database === "string" ? args.database.trim() : ""}`.trim(),
  })
  async listTables(session: ToolSession, args: Record<string, unknown>): Promise<string> {
    const name = this.readName(args);
    if (name === "") {
      return "The call named no database. Call list_databases to read the names, then call list_tables again.";
    }
    const nameFilter = typeof args.nameFilter === "string" ? args.nameFilter.trim() : "";

    let tables: SqlRows;
    try {
      tables = await this.connectionsService.executeSql(
        session.workspaceId,
        name,
        `SELECT
           count(*) OVER () AS "tableCount",
           c.relname AS "tableName",
           c.reltuples::bigint AS "rowEstimate",
           coalesce(d.description, '') AS "tableComment"
         FROM pg_class c
         LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
         WHERE c.relnamespace = 'public'::regnamespace
           AND c.relkind = 'r'
           AND ($1::text = '' OR c.relname ILIKE '%' || $1::text || '%')
         ORDER BY c.relname
         LIMIT 200`,
        [nameFilter],
      );
    } catch (error) {
      return `The tables did not list: ${this.readFailure(error)}. Call list_databases, then call list_tables with a name it reported.`;
    }

    if (tables.rows.length === 0) {
      return nameFilter === ""
        ? `The database ${name} holds no table.`
        : `No table of ${name} holds ${nameFilter} in its name. Call list_tables again with another filter, or with null to read every table.`;
    }

    const tableCount = Number(tables.rows[0][0]);
    const lines = tables.rows.map(([, tableName, rowEstimate, tableComment]) => {
      const rowCount = Number(rowEstimate) < 0 ? "unknown" : `~${rowEstimate}`;
      const comment = tableComment === "" ? "" : ` -- ${tableComment}`;
      return `${tableName} (${rowCount} rows)${comment}`;
    });
    const heading =
      tableCount <= lines.length
        ? `${name} holds ${tableCount} tables.`
        : `${name} holds ${tableCount} tables, and this call reports the first ${lines.length}. Call list_tables again with a name filter.`;

    return this.cutToBudget(
      `${heading}\n${lines.join("\n")}`,
      8_000,
      "Call list_tables again with a name filter.",
    );
  }

  /**
   * Report the columns, the keys and up to five sample rows of each named table.
   *
   * The call reads at most five tables, because a wider call costs more than the model can use in one step.
   * The sample rows carry the meaning that a name such as `cst_typ_cd` and an empty column comment withhold.
   * They come from the live table, so they are real records and never a sample the API invented.
   */
  @Tool({
    name: "describe_tables",
    description:
      "Read the columns, the primary key, the foreign keys and up to five sample rows of up to five tables of one registered database.",
    parameters: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "The name of one registered database, as list_databases reported it.",
        },
        tables: {
          type: "array",
          items: { type: "string" },
          description:
            "The names of at most five tables, as list_tables reported them. Name every table of one join in one call.",
        },
      },
      required: ["database", "tables"],
      additionalProperties: false,
    },
    buildDisplayText: (args) =>
      `read the columns of ${(Array.isArray(args.tables) ? args.tables : []).join(", ")}`,
  })
  async describeTables(session: ToolSession, args: Record<string, unknown>): Promise<string> {
    const name = this.readName(args);
    if (name === "") {
      return "The call named no database. Call list_databases to read the names, then call describe_tables again.";
    }
    const requested = (Array.isArray(args.tables) ? args.tables : [])
      .filter((table): table is string => typeof table === "string")
      .map((table) => table.trim())
      .filter((table) => table !== "");
    if (requested.length === 0) {
      return "The call named no table. Call list_tables to read the names, then call describe_tables again.";
    }
    const tableNames = requested.slice(0, 5);

    let columns: SqlRows;
    let constraints: SqlRows;
    try {
      [columns, constraints] = await Promise.all([
        this.connectionsService.executeSql(
          session.workspaceId,
          name,
          `SELECT
             c.relname AS "tableName",
             a.attname AS "columnName",
             format_type(a.atttypid, a.atttypmod) AS "dataType",
             a.attnotnull::text AS "isNotNull",
             coalesce(d.description, '') AS "columnComment"
           FROM pg_class c
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
           LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
           WHERE c.relnamespace = 'public'::regnamespace
             AND c.relkind = 'r'
             AND c.relname = ANY($1::text[])
           ORDER BY c.relname, a.attnum`,
          [tableNames],
        ),
        this.connectionsService.executeSql(
          session.workspaceId,
          name,
          `SELECT c.relname AS "tableName", pg_get_constraintdef(k.oid) AS "definition"
           FROM pg_constraint k
           JOIN pg_class c ON c.oid = k.conrelid
           WHERE c.relnamespace = 'public'::regnamespace
             AND k.contype IN ('p', 'f', 'u')
             AND c.relname = ANY($1::text[])
           ORDER BY c.relname, (k.contype <> 'p'), k.contype`,
          [tableNames],
        ),
      ]);
    } catch (error) {
      return `The tables did not describe: ${this.readFailure(error)}. Call list_tables, then call describe_tables with the names it reported.`;
    }

    const foundNames = [...new Set(columns.rows.map((row) => row[0]))];
    if (foundNames.length === 0) {
      return `The database ${name} holds none of these tables: ${tableNames.join(", ")}. Call list_tables to read the names it does hold.`;
    }

    const samples = await Promise.all(
      foundNames.map(async (tableName) => {
        try {
          const rows = await this.connectionsService.executeSql(
            session.workspaceId,
            name,
            `SELECT * FROM public."${tableName.replaceAll('"', '""')}" LIMIT 5`,
          );

          return rows.rows.length === 0
            ? ["  The table holds no row."]
            : [
                `  ${rows.rows.length} sample rows:`,
                ...this.renderRows(rows).map((line) => `  ${line}`),
              ];
        } catch (error) {
          return [`  The sample rows did not read: ${this.readFailure(error)}.`];
        }
      }),
    );

    const sections = foundNames.map((tableName, index) => {
      const lines = [tableName];
      for (const [, columnName, dataType, isNotNull, columnComment] of columns.rows.filter(
        (row) => row[0] === tableName,
      )) {
        const nullability = isNotNull === "true" ? "not null" : "null";
        const comment = columnComment === "" ? "" : ` -- ${columnComment}`;
        lines.push(`  ${columnName} ${dataType} ${nullability}${comment}`);
      }
      for (const [, definition] of constraints.rows.filter((row) => row[0] === tableName)) {
        lines.push(`  ${definition}`);
      }
      lines.push(...samples[index]);

      return lines.join("\n");
    });

    const missing = tableNames.filter((tableName) => !foundNames.includes(tableName));
    if (missing.length > 0) {
      sections.push(`The database ${name} holds no table named ${missing.join(", ")}.`);
    }
    if (requested.length > tableNames.length) {
      sections.push(
        `The call named ${requested.length} tables. This answer covers the first five. Call describe_tables again for the rest.`,
      );
    }

    return this.cutToBudget(
      sections.join("\n\n"),
      12_000,
      "Call describe_tables again for fewer tables.",
    );
  }

  /**
   * Run one SELECT against a registered database and return its rows as text.
   *
   * Rejects anything but a single SELECT or WITH statement, and wraps the statement in an outer LIMIT so no
   * answer reads more than 1000 rows. The connected role, the read-only transaction and the sixty second
   * timeout stop a write; this check only tells the model what it did wrong.
   */
  @Tool({
    name: "execute_sql",
    description:
      "Run one read-only SELECT against a registered database and return the rows it matches.",
    parameters: {
      type: "object",
      properties: {
        database: {
          type: "string",
          description: "The name of the database to query, as list_databases reported it.",
        },
        sql: {
          type: "string",
          description:
            "One PostgreSQL SELECT statement. Use the exact table and column names describe_tables reported.",
        },
      },
      required: ["database", "sql"],
      additionalProperties: false,
    },
    buildDisplayText: (args) =>
      `ran sql on ${typeof args.database === "string" ? args.database.trim() : ""}`.trim(),
  })
  async executeSql(session: ToolSession, args: Record<string, unknown>): Promise<string> {
    const name = this.readName(args);
    if (name === "") {
      return "The call named no database. Call list_databases to read the names, then call execute_sql again.";
    }

    const sql = (typeof args.sql === "string" ? args.sql : "").trim().replace(/;+$/, "").trim();
    if (sql === "") {
      return "The call carried no sql. Call execute_sql again with one SELECT statement.";
    }
    if (sql.includes(";")) {
      return "The sql held more than one statement. Send one SELECT statement and no semicolon.";
    }
    if (!/^(select|with)\b/i.test(sql)) {
      return "The sql must start with SELECT or WITH. This database is read-only.";
    }

    let rows: SqlRows;
    try {
      rows = await this.connectionsService.executeSql(
        session.workspaceId,
        name,
        `SELECT * FROM (${sql}) AS query LIMIT 1000`,
      );
    } catch (error) {
      return `The query did not run: ${this.readFailure(error)}. Call describe_tables again, then correct the database name and the column names.`;
    }

    session.emit({ type: "rows", database: name, sql, columns: rows.columns, rows: rows.rows });
    if (rows.rows.length === 0) {
      return "The query matched no row.";
    }

    const table = [
      ...this.renderRows(rows),
      `${rows.rows.length} row${rows.rows.length === 1 ? "" : "s"}.`,
    ].join("\n");

    return this.cutToBudget(table, 20_000, "Add a WHERE clause, or select fewer columns.");
  }
}
