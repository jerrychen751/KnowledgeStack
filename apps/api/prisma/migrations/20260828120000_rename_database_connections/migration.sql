BEGIN;

ALTER TABLE "db_connections"
    RENAME TO "database_connections";

ALTER TABLE "database_connections"
    RENAME CONSTRAINT "db_connections_pkey" TO "database_connections_pkey";

ALTER TABLE "database_connections"
    RENAME CONSTRAINT "db_connections_workspace_id_fkey" TO "database_connections_workspace_id_fkey";

ALTER INDEX "db_connections_workspace_id_idx"
    RENAME TO "database_connections_workspace_id_idx";

CREATE UNIQUE INDEX "database_connections_workspace_id_name_key"
    ON "database_connections" ("workspace_id", "name");

COMMIT;
