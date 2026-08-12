BEGIN;

-- The embed step builds the context line from documents.external_title and the heading path below it.
ALTER TABLE "documents"
    DROP COLUMN "title_path";

-- Prisma emits nullable SQL for scalar lists; a chunk of plain text holds an empty array, never null.
-- The default fills the rows that already exist, and then leaves because the model declares none.
ALTER TABLE "document_chunks"
    ADD COLUMN "heading_path" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "document_chunks"
    ALTER COLUMN "heading_path" DROP DEFAULT;

COMMIT;
