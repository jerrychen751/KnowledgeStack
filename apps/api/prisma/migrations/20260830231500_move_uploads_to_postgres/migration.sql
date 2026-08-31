-- RenameEnumValue
ALTER TYPE "SourceProvider" RENAME VALUE 'filesystem' TO 'upload';

-- RenameIndex
ALTER INDEX "sources_filesystem_identity_key" RENAME TO "sources_upload_identity_key";

-- This table arrives empty, because SQL cannot read the files the old UPLOAD_ROOT directory holds.
-- Copy each one into uploaded_files before the next sync on a database that already holds upload
-- documents. UploadConnector.listDocuments otherwise returns nothing, checkDocumentExists answers
-- false for every stored document, and the sweep in sync/sync.service.ts deletes all of them with
-- every chunk they embed. No error reports that loss.

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" TEXT NOT NULL,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_workspace_id_file_name_key" ON "uploaded_files"("workspace_id", "file_name");

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An upload source no longer reads a directory, so its externalId becomes the workspace it serves.
UPDATE "sources" SET "external_id" = "workspace_id" WHERE "provider" = 'upload';

-- encodeURIComponent encodes only the space among the characters saveUploads accepts in a file name.
UPDATE "documents"
SET "external_url" = 'upload:' || replace("external_id", ' ', '%20')
WHERE "source_id" IN (SELECT "id" FROM "sources" WHERE "provider" = 'upload');
