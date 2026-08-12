BEGIN;

ALTER TABLE "documents"
    RENAME COLUMN "source_id" TO "document_source_id";

ALTER TABLE "documents"
    RENAME COLUMN "indexed_at" TO "last_indexed_at";

ALTER TABLE "documents"
    DROP COLUMN "deleted_at";

ALTER TABLE "documents"
    RENAME CONSTRAINT "documents_source_id_fkey"
    TO "documents_document_source_id_fkey";

ALTER INDEX "documents_source_id_external_id_key"
    RENAME TO "documents_document_source_id_external_id_key";

ALTER INDEX "documents_source_id_last_seen_at_idx"
    RENAME TO "documents_document_source_id_last_seen_at_idx";

COMMIT;
