/** The wire shapes of the /database-connections routes, which register the business databases the agent queries. */

import { z } from "zod";

export const databaseEngineSchema = z.enum(["POSTGRESQL", "MYSQL", "MONGODB"]);

/** The database product that one connection uses. */
export type DatabaseEngine = z.infer<typeof databaseEngineSchema>;

export const databaseConnectionStatusSchema = z.enum(["active", "error"]);

/** The result of the last check that opened a connection with the stored credentials. `error` means that check failed, so the browser must show the connection as inactive and offer the person the test route and the create route. Every stored connection opened at least once, because the create route stores no row that never connected. */
export type DatabaseConnectionStatus = z.infer<typeof databaseConnectionStatusSchema>;

export const databaseConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  engine: databaseEngineSchema,
  host: z.string(),
  port: z.number().int(),
  database: z.string(),
  username: z.string(),
  status: databaseConnectionStatusSchema,
  lastCheckedAt: z.string(),
  createdAt: z.string(),
});

/** One registered database connection, without the password. `createdAt` and `lastCheckedAt` are ISO 8601 timestamps, such as "2026-08-28T16:42:03.000Z". `lastCheckedAt` is never absent, because the API stores no row that never connected. `name` is unique inside the workspace, and the agent addresses a database by it. `description` says what the database holds, such as "Orders and invoices from the ERP", and the agent reads it to choose between two databases. A row registered before the description column existed carries an empty string. */
export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>;

export const listDatabaseConnectionsResponseSchema = z.object({
  databaseConnections: z.array(databaseConnectionSchema),
});

/** The body `GET /database-connections` answers with, oldest connection first. */
export type ListDatabaseConnectionsResponse = z.infer<
  typeof listDatabaseConnectionsResponseSchema
>;

export const createDatabaseConnectionRequestSchema = z.object(
  {
    name: z
      .string({ error: "name must be a non-empty string." })
      .trim()
      .min(1, "name must be a non-empty string.")
      .max(60, "name must hold 60 characters or fewer."),
    description: z
      .string({ error: "description must be a non-empty string." })
      .trim()
      .min(1, "description must be a non-empty string.")
      .max(500, "description must hold 500 characters or fewer."),
    engine: z.literal("POSTGRESQL", { error: 'engine must be "POSTGRESQL".' }),
    host: z
      .string({ error: "host must be a non-empty string." })
      .trim()
      .min(1, "host must be a non-empty string.")
      .max(255, "host must hold 255 characters or fewer."),
    port: z
      .number({ error: "port must be an integer from 1 through 65535." })
      .int("port must be an integer from 1 through 65535.")
      .min(1, "port must be an integer from 1 through 65535.")
      .max(65_535, "port must be an integer from 1 through 65535."),
    database: z
      .string({ error: "database must be a non-empty string." })
      .trim()
      .min(1, "database must be a non-empty string.")
      .max(63, "database must hold 63 characters or fewer."),
    username: z
      .string({ error: "username must be a non-empty string." })
      .trim()
      .min(1, "username must be a non-empty string.")
      .max(63, "username must hold 63 characters or fewer."),
    password: z
      .string({ error: "password must be a non-empty string." })
      .min(1, "password must be a non-empty string.")
      .max(255, "password must hold 255 characters or fewer."),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /database-connections` reads. The route accepts only the `POSTGRESQL` engine because the API has only a PostgreSQL query driver. `username` and `password` must name a read-only role, because that role is what stops the agent from writing. `password` never comes back out of the API. `description` is required and must say what the database holds, because the agent chooses a database by it. Send the same `name` again to correct the credentials and the description of a connection the workspace already holds. */
export type CreateDatabaseConnectionRequest = z.infer<
  typeof createDatabaseConnectionRequestSchema
>;

export const createDatabaseConnectionResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    databaseConnection: databaseConnectionSchema,
  }),
  z.object({
    success: z.literal(false),
    message: z.string(),
    databaseConnection: databaseConnectionSchema.nullable(),
  }),
]);

/** The body `POST /database-connections` answers with. The route answers 200 for both outcomes. `success` is true when the submitted credentials opened a connection, and `databaseConnection` then carries the stored row, whether the route inserted it or corrected the row that already held that name. `success` is false when the credentials did not open a connection, and `message` then carries the text the driver reported, such as `password authentication failed for user "agent_readonly"`. A failure writes nothing: a name the workspace did not hold stays unregistered and `databaseConnection` is null, and a name the workspace already held keeps its stored credentials and `databaseConnection` carries that unchanged row. */
export type CreateDatabaseConnectionResponse = z.infer<
  typeof createDatabaseConnectionResponseSchema
>;

export const testDatabaseConnectionResponseSchema = z.object({
  databaseConnection: databaseConnectionSchema,
  message: z.string(),
});

/** The body `POST /database-connections/:databaseConnectionId/test` answers with. The check reads the stored credentials, and `databaseConnection` carries the row with `status` and `lastCheckedAt` refreshed by it. `message` is empty when the connection opened, and carries the text the driver reported when it did not, such as `password authentication failed for user "agent_readonly"`. */
export type TestDatabaseConnectionResponse = z.infer<
  typeof testDatabaseConnectionResponseSchema
>;
