/** The wire shapes of the /database-connections routes, which register the business databases the agent queries. */

/** The database product that one connection uses. */
export type DatabaseEngine = "POSTGRESQL" | "MYSQL" | "MONGODB";

/** The result of the last check that opened a connection with the stored credentials. `error` means that check failed, so the browser must show the connection as inactive and offer the person the test route and the create route. Every stored connection opened at least once, because the create route stores no row that never connected. */
export type DatabaseConnectionStatus = "active" | "error";

/** One registered database connection, without the password. `createdAt` and `lastCheckedAt` are ISO 8601 timestamps, such as "2026-08-28T16:42:03.000Z". `lastCheckedAt` is never absent, because the API stores no row that never connected. `name` is unique inside the workspace, and the agent addresses a database by it. `description` says what the database holds, such as "Orders and invoices from the ERP", and the agent reads it to choose between two databases. A row registered before the description column existed carries an empty string. */
export type DatabaseConnection = {
  id: string;
  name: string;
  description: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  status: DatabaseConnectionStatus;
  lastCheckedAt: string;
  createdAt: string;
};

/** The body `GET /database-connections` answers with, oldest connection first. */
export type ListDatabaseConnectionsResponse = {
  databaseConnections: DatabaseConnection[];
};

/** The body `POST /database-connections` reads. The route accepts only the `POSTGRESQL` engine because the API has only a PostgreSQL query driver. `username` and `password` must name a read-only role, because that role is what stops the agent from writing. `password` never comes back out of the API. `description` is required and must say what the database holds, because the agent chooses a database by it. Send the same `name` again to correct the credentials and the description of a connection the workspace already holds. */
export type CreateDatabaseConnectionRequest = {
  name: string;
  description: string;
  engine: "POSTGRESQL";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

/** The body `POST /database-connections` answers with. The route answers 200 for both outcomes. `success` is true when the submitted credentials opened a connection, and `databaseConnection` then carries the stored row, whether the route inserted it or corrected the row that already held that name. `success` is false when the credentials did not open a connection, and `message` then carries the text the driver reported, such as `password authentication failed for user "agent_readonly"`. A failure writes nothing: a name the workspace did not hold stays unregistered and `databaseConnection` is null, and a name the workspace already held keeps its stored credentials and `databaseConnection` carries that unchanged row. */
export type CreateDatabaseConnectionResponse =
  | { success: true; databaseConnection: DatabaseConnection }
  | { success: false; message: string; databaseConnection: DatabaseConnection | null };

/** The body `POST /database-connections/:databaseConnectionId/test` answers with. The check reads the stored credentials, and `databaseConnection` carries the row with `status` and `lastCheckedAt` refreshed by it. `message` is empty when the connection opened, and carries the text the driver reported when it did not, such as `password authentication failed for user "agent_readonly"`. */
export type TestDatabaseConnectionResponse = {
  databaseConnection: DatabaseConnection;
  message: string;
};
