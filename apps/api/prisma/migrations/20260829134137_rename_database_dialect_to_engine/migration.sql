BEGIN;

CREATE TYPE "DatabaseEngine" AS ENUM ('POSTGRESQL', 'MYSQL', 'MONGODB');

ALTER TABLE "database_connections"
    RENAME COLUMN "dialect" TO "engine";

ALTER TABLE "database_connections"
    ALTER COLUMN "engine" TYPE "DatabaseEngine"
    USING (
        CASE "engine"
            WHEN 'postgres' THEN 'POSTGRESQL'::"DatabaseEngine"
            WHEN 'mysql' THEN 'MYSQL'::"DatabaseEngine"
            WHEN 'mongodb' THEN 'MONGODB'::"DatabaseEngine"
            ELSE "engine"::"DatabaseEngine"
        END
    );

COMMIT;
