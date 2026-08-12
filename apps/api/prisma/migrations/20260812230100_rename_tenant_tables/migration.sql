BEGIN;

ALTER TABLE "Tenant"
    RENAME TO "tenants";

ALTER TABLE "DBConnection"
    RENAME TO "db_connections";

ALTER TABLE "tenants"
    RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "tenants"
    RENAME COLUMN "updatedAt" TO "updated_at";

ALTER TABLE "db_connections"
    RENAME COLUMN "enc_password" TO "encrypted_password";

ALTER TABLE "db_connections"
    RENAME COLUMN "createdAt" TO "created_at";

ALTER TABLE "db_connections"
    RENAME COLUMN "updatedAt" TO "updated_at";

-- PostgreSQL keeps the old constraint and index names after a table rename, and Prisma derives every
-- name from the mapped table name, so each one needs its own rename to keep the next diff empty.
-- DBConnection.tenantId carries no @map, so the index and the key it names stay camel case.
ALTER TABLE "tenants"
    RENAME CONSTRAINT "Tenant_pkey" TO "tenants_pkey";

ALTER TABLE "db_connections"
    RENAME CONSTRAINT "DBConnection_pkey" TO "db_connections_pkey";

ALTER TABLE "db_connections"
    RENAME CONSTRAINT "DBConnection_tenantId_fkey" TO "db_connections_tenantId_fkey";

ALTER INDEX "Tenant_slug_key"
    RENAME TO "tenants_slug_key";

ALTER INDEX "DBConnection_tenantId_idx"
    RENAME TO "db_connections_tenantId_idx";

COMMIT;
