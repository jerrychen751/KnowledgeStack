-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "DocumentSourceProvider" AS ENUM ('filesystem', 'notion', 'confluence');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('page', 'database', 'attachment');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('active', 'reauth_required', 'error');

-- CreateTable
CREATE TABLE "document_sources" (
    "id" TEXT NOT NULL,
    "provider" "DocumentSourceProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_display_name" TEXT NOT NULL,
    "external_user_id" TEXT,
    "external_user_email" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "document_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_sources_access_token_check" CHECK ("provider" = 'filesystem' OR "encrypted_access_token" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_title" TEXT NOT NULL,
    "external_parent_id" TEXT,
    "external_parent_type" TEXT,
    -- Prisma emits nullable SQL for scalar lists; every title path must include external_title.
    "title_path" TEXT[] NOT NULL,
    "external_url" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "external_updated_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "indexed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "source_id" TEXT NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_id" TEXT NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_sources_tenant_id_idx" ON "document_sources"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sources_tenant_id_provider_external_id_key" ON "document_sources"("tenant_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "documents_source_id_last_seen_at_idx" ON "documents"("source_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_source_id_external_id_key" ON "documents"("source_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_id_chunk_index_key" ON "document_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "document_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
