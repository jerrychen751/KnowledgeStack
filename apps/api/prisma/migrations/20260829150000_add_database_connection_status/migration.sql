BEGIN;

CREATE TYPE "DatabaseConnectionStatus" AS ENUM ('active', 'error');

ALTER TABLE "database_connections"
    ADD COLUMN "status" "DatabaseConnectionStatus" NOT NULL DEFAULT 'active',
    ADD COLUMN "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
