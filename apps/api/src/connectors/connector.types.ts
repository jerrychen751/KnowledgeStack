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
  // Provider-controlled Markdown; sanitize it before an HTML renderer uses it.
  contents: string;
  externalUpdatedAt: Date;
};

export type ListDocumentsOptions = {
  cursor?: string;
  pageSize?: number;
};

export type DocumentPage = {
  documents: DocumentRef[];
  // True when a complete cursor walk lists every document in the source.
  isExhaustive: boolean;
  nextCursor: string | null;
};

export interface DocumentConnector {
  listDocuments(options?: ListDocumentsOptions): Promise<DocumentPage>;
  fetchDocumentById(externalId: string): Promise<DocumentBody>;
}
