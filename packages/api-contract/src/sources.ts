/** The wire shapes of the /sources routes, which connect a provider, upload files, and report what is indexed. */

import { z } from "zod";

import { startSignInResponseSchema } from "./auth.js";

export const sourceProviderSchema = z.enum(["confluence", "filesystem", "notion"]);

/** The system a source reads. `filesystem` reads the upload directory of one workspace. */
export type SourceProvider = z.infer<typeof sourceProviderSchema>;

export const sourceStatusSchema = z.enum(["active", "error", "reauth_required"]);

/** Whether a source can sync. `reauth_required` means the stored grant no longer works. */
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const documentTypeSchema = z.enum(["attachment", "database", "page"]);

/** The category of a document in our own vocabulary, not in the vocabulary of the provider. The sync pass reads no text from an `attachment`, such as a PDF. */
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const sourceSchema = z.object({
  id: z.string(),
  provider: sourceProviderSchema,
  externalId: z.string(),
  externalDisplayName: z.string(),
  status: sourceStatusSchema,
  lastSyncedAt: z.string().nullable(),
  documentCount: z.number().int(),
  chunkCount: z.number().int(),
});

/** One connected source with the volume it holds. `externalDisplayName` is the mutable provider name, such as a Notion workspace_name, and never identifies the source. `lastSyncedAt` is an ISO 8601 timestamp, such as "2026-08-20T16:42:03.000Z", and null before the first sync pass. */
export type Source = z.infer<typeof sourceSchema>;

export const listSourcesResponseSchema = z.object({
  sources: z.array(sourceSchema),
});

/** The body `GET /sources` answers with, oldest source first. */
export type ListSourcesResponse = z.infer<typeof listSourcesResponseSchema>;

export const sourceDocumentSchema = z.object({
  id: z.string(),
  externalTitle: z.string(),
  externalUrl: z.string(),
  documentType: documentTypeSchema,
  externalUpdatedAt: z.string(),
  lastIndexedAt: z.string().nullable(),
  chunkCount: z.number().int(),
});

/** One document of a source, with the number of chunks it produced in `chunkCount`. `externalUpdatedAt` is the edit time the provider reports and `lastIndexedAt` is the time the chunks were last written, both ISO 8601. `lastIndexedAt` is null until the first index pass writes a chunk. */
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const listDocumentsResponseSchema = z.object({
  documents: z.array(sourceDocumentSchema),
});

/** The body `GET /sources/:sourceId/documents` answers with, by title. */
export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;

export const readConnectorStatusResponseSchema = z.object({
  uploads: z.object({
    directory: z.string(),
    fileExtensions: z.array(z.string()),
  }),
  providers: z.array(
    z.object({
      provider: sourceProviderSchema,
      missingVariables: z.array(z.string()),
    }),
  ),
});

/** The body `GET /sources/connectors` answers with. `fileExtensions` lists the extensions an upload may carry, such as ".md". `missingVariables` names each environment variable the deployment must set before the provider can connect, such as ["NOTION_CLIENT_SECRET"], and is empty when it can. */
export type ReadConnectorStatusResponse = z.infer<typeof readConnectorStatusResponseSchema>;

export const startAuthorizationResponseSchema = startSignInResponseSchema;

/** The body `GET /sources/connect/:provider` answers with. It carries the field of `StartSignInResponse`, because both routes send the browser to a provider for a grant. */
export type StartAuthorizationResponse = z.infer<typeof startAuthorizationResponseSchema>;

export const uploadedFileSchema = z
  .object(
    {
      name: z.string({ error: "Each file must carry a name string and a text string." }),
      text: z.string({ error: "Each file must carry a name string and a text string." }),
    },
    { error: "Each file must carry a name string and a text string." },
  )
  .check((ctx) => {
    if (ctx.value.text.length > 1_000_000) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: `"${ctx.value.name}" must hold 1000000 characters or fewer.`,
      });
    }
  });

/** One file of an upload request. `text` holds the whole file, of 1000000 characters or fewer. An empty file is valid and indexes to zero chunks. */
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

export const saveUploadsRequestSchema = z.object(
  {
    files: z
      .array(uploadedFileSchema, { error: "files must be a non-empty array." })
      .min(1, "files must be a non-empty array.")
      .max(20, "files must hold 20 entries or fewer."),
  },
  { error: "The body must be one JSON object." },
);

/** The body `POST /sources/uploads` reads. It holds 1 through 20 files. */
export type SaveUploadsRequest = z.infer<typeof saveUploadsRequestSchema>;

export const saveUploadsResponseSchema = z.object({
  sourceId: z.string(),
});

/** The body `POST /sources/uploads` answers with, after the whole sync pass finishes, so the caller can read the new counts at once. */
export type SaveUploadsResponse = z.infer<typeof saveUploadsResponseSchema>;
