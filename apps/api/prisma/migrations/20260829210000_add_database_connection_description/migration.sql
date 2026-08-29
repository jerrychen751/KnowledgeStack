BEGIN;

ALTER TABLE "database_connections"
    ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

ALTER TABLE "database_connections"
    ALTER COLUMN "description" DROP DEFAULT;

COMMIT;
