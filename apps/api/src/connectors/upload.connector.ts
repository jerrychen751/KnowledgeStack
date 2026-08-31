import { DocumentType } from "../generated/prisma/enums.js";

import {
  type DeletableDocumentConnector,
  type DocumentBody,
  type DocumentPage,
  type ListDocumentsOptions,
} from "./connector.types.js";
import { UploadedFileRepository } from "./uploaded-file.repository.js";

export type UploadConnectorOptions = {
  workspaceId: string;
};

/**
 * Serve the files a person uploaded to one workspace, from the `uploaded_files` table.
 *
 * The file name is the whole document id: it is both `externalId` and `externalTitle` of the document that
 * indexes the file, so the deletion sweep matches a stored document to a row by name alone. The store
 * belongs to the same database as the index, so it can never be absent the way an unmounted directory can.
 * A missing row therefore always means the person deleted that file, never that the store is unreachable.
 */
export class UploadConnector implements DeletableDocumentConnector {
  constructor(
    private readonly options: UploadConnectorOptions,
    private readonly uploadedFileRepository: UploadedFileRepository,
  ) {}

  async listDocuments(options: ListDocumentsOptions = {}): Promise<DocumentPage> {
    const pageSize = options.pageSize ?? 100;
    const uploadedFiles = await this.uploadedFileRepository.listUploadedFiles(
      this.options.workspaceId,
      options.cursor,
      pageSize + 1,
    );
    const pageFiles = uploadedFiles.slice(0, pageSize);

    return {
      documents: pageFiles.map((uploadedFile) => ({
        externalId: uploadedFile.fileName,
        externalTitle: uploadedFile.fileName,
        externalParentId: null,
        externalParentType: null,
        externalUrl: `upload:${encodeURIComponent(uploadedFile.fileName)}`,
        documentType: DocumentType.page,
        externalUpdatedAt: uploadedFile.updatedAt,
      })),
      nextCursor:
        uploadedFiles.length > pageSize ? (pageFiles.at(-1)?.fileName ?? null) : null,
    };
  }

  async fetchDocumentById(externalId: string): Promise<DocumentBody> {
    const uploadedFile = await this.uploadedFileRepository.findUploadedFile(
      this.options.workspaceId,
      externalId,
    );
    if (uploadedFile === null) {
      throw new TypeError(`This workspace holds no uploaded file named ${externalId}.`);
    }

    return {
      externalId,
      externalUpdatedAt: uploadedFile.updatedAt,
      textFormat: externalId.toLowerCase().endsWith(".md") ? "markdown" : "plain_text",
      text: uploadedFile.text,
    };
  }

  async checkDocumentExists(externalId: string): Promise<boolean> {
    return this.uploadedFileRepository.checkUploadedFileExists(
      this.options.workspaceId,
      externalId,
    );
  }

  async deleteDocument(externalId: string): Promise<void> {
    await this.uploadedFileRepository.deleteUploadedFile(this.options.workspaceId, externalId);
  }
}
