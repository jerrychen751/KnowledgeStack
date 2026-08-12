BEGIN;

-- CreateTable
CREATE TABLE "source_credentials" (
    "id" TEXT NOT NULL,
    "provider" "DocumentSourceProvider" NOT NULL,
    "external_id" TEXT,
    "external_display_name" TEXT NOT NULL,
    "external_user_id" TEXT,
    "external_user_email" TEXT,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "source_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "source_credentials_provider_check" CHECK ("provider" <> 'filesystem')
);

-- AlterTable
ALTER TABLE "document_sources"
    ADD COLUMN "credential_id" TEXT,
    ADD COLUMN "external_space_id" TEXT;

-- A prior Confluence source can migrate only when its config names one exact space id.
UPDATE "document_sources"
SET "external_space_id" = "config"->'spaceIds'->>0
WHERE "provider" = 'confluence'
  AND CASE
      WHEN jsonb_typeof("config"->'spaceIds') = 'array'
      THEN jsonb_array_length("config"->'spaceIds') = 1
      ELSE false
  END
  AND length("config"->'spaceIds'->>0) > 0;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "document_sources"
        WHERE "provider" = 'confluence'
          AND "external_space_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'A Confluence source must name one space id in config.spaceIds before this migration can run';
    END IF;
END
$$;

-- One Atlassian app grant belongs to one tenant and Atlassian account. A legacy Notion row has no bot_id, so it keeps its own credential.
CREATE TEMP TABLE "source_credential_links" ON COMMIT DROP AS
SELECT
    "id" AS "source_id",
    first_value("id") OVER (
        PARTITION BY
            "tenant_id",
            "provider",
            CASE
                WHEN "provider" = 'confluence' AND "external_user_id" IS NOT NULL
                THEN "external_user_id"
                ELSE "id"
            END
        ORDER BY "expires_at" DESC NULLS LAST, "updated_at" DESC, "id"
    ) AS "credential_id"
FROM "document_sources"
WHERE "provider" <> 'filesystem';

-- Move one current token pair for each authorization into the credential table.
INSERT INTO "source_credentials" (
    "id",
    "provider",
    "external_id",
    "external_display_name",
    "external_user_id",
    "external_user_email",
    "encrypted_access_token",
    "encrypted_refresh_token",
    "expires_at",
    "scope",
    "status",
    "created_at",
    "updated_at",
    "tenant_id"
)
SELECT
    source."id",
    source."provider",
    CASE
        WHEN source."provider" = 'confluence' THEN source."external_user_id"
        ELSE NULL
    END,
    source."external_display_name",
    source."external_user_id",
    source."external_user_email",
    source."encrypted_access_token",
    source."encrypted_refresh_token",
    source."expires_at",
    source."scope",
    source."status",
    source."created_at",
    source."updated_at",
    source."tenant_id"
FROM "document_sources" AS source
JOIN "source_credential_links" AS link
    ON link."source_id" = source."id"
   AND link."credential_id" = source."id";

UPDATE "document_sources" AS source
SET "credential_id" = link."credential_id"
FROM "source_credential_links" AS link
WHERE link."source_id" = source."id";

UPDATE "document_sources" AS source
SET "status" = credential."status"
FROM "source_credentials" AS credential
WHERE source."credential_id" = credential."id";

-- DropIndex
DROP INDEX "document_sources_tenant_id_provider_external_id_key";

-- AlterTable
ALTER TABLE "document_sources"
    DROP CONSTRAINT "document_sources_access_token_check",
    DROP COLUMN "encrypted_access_token",
    DROP COLUMN "encrypted_refresh_token",
    DROP COLUMN "expires_at",
    DROP COLUMN "external_user_id",
    DROP COLUMN "external_user_email",
    DROP COLUMN "scope";

-- CreateIndex
CREATE UNIQUE INDEX "source_credentials_tenant_id_provider_external_id_key"
    ON "source_credentials"("tenant_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_credentials_id_tenant_id_provider_key"
    ON "source_credentials"("id", "tenant_id", "provider");

-- CreateIndex
CREATE INDEX "source_credentials_tenant_id_idx"
    ON "source_credentials"("tenant_id");

-- PostgreSQL partial indexes enforce the source identity for each provider.
CREATE UNIQUE INDEX "document_sources_notion_identity_key"
    ON "document_sources"("tenant_id", "provider", "credential_id")
    WHERE "provider" = 'notion';

CREATE UNIQUE INDEX "document_sources_confluence_identity_key"
    ON "document_sources"("tenant_id", "provider", "external_id", "external_space_id")
    WHERE "provider" = 'confluence' AND "external_space_id" IS NOT NULL;

CREATE UNIQUE INDEX "document_sources_filesystem_identity_key"
    ON "document_sources"("tenant_id", "provider", "external_id")
    WHERE "provider" = 'filesystem';

-- CreateIndex
CREATE INDEX "document_sources_credential_id_tenant_id_provider_idx"
    ON "document_sources"("credential_id", "tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "source_credentials"
    ADD CONSTRAINT "source_credentials_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sources"
    ADD CONSTRAINT "document_sources_credential_id_tenant_id_provider_fkey"
    FOREIGN KEY ("credential_id", "tenant_id", "provider")
    REFERENCES "source_credentials"("id", "tenant_id", "provider")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_sources"
    ADD CONSTRAINT "document_sources_credential_check"
    CHECK (
        ("provider" = 'filesystem' AND "credential_id" IS NULL)
        OR ("provider" <> 'filesystem' AND "credential_id" IS NOT NULL)
    ),
    ADD CONSTRAINT "document_sources_space_check"
    CHECK (
        ("provider" = 'confluence' AND "external_space_id" IS NOT NULL)
        OR ("provider" <> 'confluence' AND "external_space_id" IS NULL)
    );

COMMIT;
