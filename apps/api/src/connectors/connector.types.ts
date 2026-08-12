import type { DocumentType } from "../generated/prisma/enums.js";

export type DocumentRef = {
  externalId: string;
  externalTitle: string;
  externalParentId: string | null;
  externalParentType: string | null;
  externalUrl: string;
  documentType: DocumentType;
  externalUpdatedAt: Date;
};

export type DocumentBody = {
  externalId: string;
  externalUpdatedAt: Date;
  contentFormat: "markdown" | "plain_text";
  // Sanitize provider-controlled text before an HTML renderer uses it.
  contents: string;
};

export type ListDocumentsOptions = {
  cursor?: string;
  pageSize?: number;
};

export type DocumentPage = {
  documents: DocumentRef[];
  nextCursor: string | null;
};

export interface DocumentConnector {
  listDocuments(options?: ListDocumentsOptions): Promise<DocumentPage>;
  fetchDocumentById(externalId: string): Promise<DocumentBody>;
  // False means the source answered that it no longer serves the document, so the caller can delete it.
  // A source that cannot answer throws, which stops a rate limit or an outage from reading as a deletion.
  checkDocumentExists(externalId: string): Promise<boolean>;
}
