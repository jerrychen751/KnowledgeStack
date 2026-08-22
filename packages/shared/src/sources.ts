/** The wire shapes of the /sources routes, which connect a provider, upload files, and report what is indexed. */

import type { StartSignInResponse } from "./auth.js";

/** The system a source reads. `filesystem` reads the upload directory of one workspace. */
export type SourceProvider = "confluence" | "filesystem" | "notion";

/** Whether a source can sync. `reauth_required` means the stored grant no longer works. */
export type SourceStatus = "active" | "error" | "reauth_required";

/** The category of a document in our own vocabulary, not in the vocabulary of the provider. The sync pass reads no text from an `attachment`, such as a PDF. */
export type DocumentType = "attachment" | "database" | "page";

/** One connected source with the volume it holds. `externalDisplayName` is the mutable provider name, such as a Notion workspace_name, and never identifies the source. `lastSyncedAt` is an ISO 8601 timestamp, such as "2026-08-20T16:42:03.000Z", and null before the first sync pass. */
export type Source = {
  id: string;
  provider: SourceProvider;
  externalId: string;
  externalDisplayName: string;
  status: SourceStatus;
  lastSyncedAt: string | null;
  documentCount: number;
  chunkCount: number;
};

/** The body `GET /sources` answers with, oldest source first. */
export type ListSourcesResponse = {
  sources: Source[];
};

/** One document of a source, with the number of chunks it produced in `_count.chunks`. `externalUpdatedAt` is the edit time the provider reports and `lastIndexedAt` is the time the chunks were last written, both ISO 8601. `lastIndexedAt` is null until the first index pass writes a chunk. */
export type SourceDocument = {
  id: string;
  externalTitle: string;
  externalUrl: string;
  documentType: DocumentType;
  externalUpdatedAt: string;
  lastIndexedAt: string | null;
  _count: { chunks: number };
};

/** The body `GET /sources/:sourceId/documents` answers with, by title. */
export type ListDocumentsResponse = {
  documents: SourceDocument[];
};

/** The body `GET /sources/connectors` answers with. `fileExtensions` lists the extensions an upload may carry, such as ".md". `detail` names the reason a provider cannot connect, and is null when it can. */
export type ReadConnectorStatusResponse = {
  uploads: {
    directory: string;
    fileExtensions: string[];
  };
  providers: {
    provider: SourceProvider;
    connectable: boolean;
    detail: string | null;
  }[];
};

/** The body `GET /sources/connect/:provider` answers with. It carries the field of `StartSignInResponse`, because both routes send the browser to a provider for a grant. */
export type StartAuthorizationResponse = StartSignInResponse;

/** One file of an upload request. `text` holds the whole file, of 1 through 1000000 characters. */
export type UploadedFile = {
  name: string;
  text: string;
};

/** The body `POST /sources/uploads` reads. It holds 1 through 20 files. */
export type SaveUploadsRequest = {
  files: UploadedFile[];
};

/** The body `POST /sources/uploads` answers with, after the whole sync pass finishes, so the caller can read the new counts at once. */
export type SaveUploadsResponse = {
  sourceId: string;
};
