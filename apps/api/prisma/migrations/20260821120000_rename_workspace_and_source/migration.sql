BEGIN;

ALTER TABLE "tenants"
    RENAME TO "workspaces";

ALTER TABLE "tenant_memberships"
    RENAME TO "workspace_memberships";

ALTER TABLE "document_sources"
    RENAME TO "sources";

ALTER TABLE "workspace_memberships"
    RENAME COLUMN "tenant_id" TO "workspace_id";

ALTER TABLE "user_sessions"
    RENAME COLUMN "active_tenant_id" TO "active_workspace_id";

-- DBConnection carried no @map, so this column was camel case while every other one was snake case.
ALTER TABLE "db_connections"
    RENAME COLUMN "tenantId" TO "workspace_id";

ALTER TABLE "sources"
    RENAME COLUMN "tenant_id" TO "workspace_id";

ALTER TABLE "source_credentials"
    RENAME COLUMN "tenant_id" TO "workspace_id";

ALTER TABLE "documents"
    RENAME COLUMN "document_source_id" TO "source_id";

ALTER TYPE "DocumentSourceProvider"
    RENAME TO "SourceProvider";

-- PostgreSQL keeps the old constraint and index names after a table or a column rename, and Prisma derives
-- every name from the mapped table and column names, so each one needs its own rename to keep the next
-- diff empty.
ALTER TABLE "workspaces"
    RENAME CONSTRAINT "tenants_pkey" TO "workspaces_pkey";

ALTER TABLE "workspace_memberships"
    RENAME CONSTRAINT "tenant_memberships_pkey" TO "workspace_memberships_pkey";

ALTER TABLE "workspace_memberships"
    RENAME CONSTRAINT "tenant_memberships_tenant_id_fkey" TO "workspace_memberships_workspace_id_fkey";

ALTER TABLE "workspace_memberships"
    RENAME CONSTRAINT "tenant_memberships_user_id_fkey" TO "workspace_memberships_user_id_fkey";

ALTER TABLE "user_sessions"
    RENAME CONSTRAINT "user_sessions_active_tenant_id_fkey" TO "user_sessions_active_workspace_id_fkey";

ALTER TABLE "db_connections"
    RENAME CONSTRAINT "db_connections_tenantId_fkey" TO "db_connections_workspace_id_fkey";

ALTER TABLE "sources"
    RENAME CONSTRAINT "document_sources_pkey" TO "sources_pkey";

ALTER TABLE "sources"
    RENAME CONSTRAINT "document_sources_tenant_id_fkey" TO "sources_workspace_id_fkey";

ALTER TABLE "sources"
    RENAME CONSTRAINT "document_sources_credential_id_tenant_id_provider_fkey" TO "sources_credential_id_workspace_id_provider_fkey";

ALTER TABLE "sources"
    RENAME CONSTRAINT "document_sources_credential_check" TO "sources_credential_check";

ALTER TABLE "sources"
    RENAME CONSTRAINT "document_sources_space_check" TO "sources_space_check";

ALTER TABLE "documents"
    RENAME CONSTRAINT "documents_document_source_id_fkey" TO "documents_source_id_fkey";

ALTER TABLE "source_credentials"
    RENAME CONSTRAINT "source_credentials_tenant_id_fkey" TO "source_credentials_workspace_id_fkey";

ALTER INDEX "tenants_slug_key"
    RENAME TO "workspaces_slug_key";

ALTER INDEX "tenants_join_code_key"
    RENAME TO "workspaces_join_code_key";

ALTER INDEX "tenant_memberships_tenant_id_user_id_key"
    RENAME TO "workspace_memberships_workspace_id_user_id_key";

ALTER INDEX "tenant_memberships_user_id_idx"
    RENAME TO "workspace_memberships_user_id_idx";

ALTER INDEX "db_connections_tenantId_idx"
    RENAME TO "db_connections_workspace_id_idx";

ALTER INDEX "document_sources_tenant_id_idx"
    RENAME TO "sources_workspace_id_idx";

ALTER INDEX "document_sources_credential_id_tenant_id_provider_idx"
    RENAME TO "sources_credential_id_workspace_id_provider_idx";

ALTER INDEX "document_sources_notion_identity_key"
    RENAME TO "sources_notion_identity_key";

ALTER INDEX "document_sources_confluence_identity_key"
    RENAME TO "sources_confluence_identity_key";

ALTER INDEX "document_sources_filesystem_identity_key"
    RENAME TO "sources_filesystem_identity_key";

ALTER INDEX "documents_document_source_id_external_id_key"
    RENAME TO "documents_source_id_external_id_key";

ALTER INDEX "documents_document_source_id_last_seen_at_idx"
    RENAME TO "documents_source_id_last_seen_at_idx";

ALTER INDEX "source_credentials_tenant_id_idx"
    RENAME TO "source_credentials_workspace_id_idx";

ALTER INDEX "source_credentials_tenant_id_provider_external_id_key"
    RENAME TO "source_credentials_workspace_id_provider_external_id_key";

ALTER INDEX "source_credentials_id_tenant_id_provider_key"
    RENAME TO "source_credentials_id_workspace_id_provider_key";

COMMIT;
