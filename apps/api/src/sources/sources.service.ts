import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import type {
  ReadConnectorStatusResponse,
  SaveUploadsResponse,
  Source,
  SourceDocument,
  UploadedFile,
} from "@knowledgestack/shared/sources";

import { OAuthRegistry } from "../auth/oauth.registry.js";
import { isDeletableConnector } from "../connectors/connector.types.js";
import type { OAuthProviderName } from "../auth/oauth.types.js";
import { TokenService } from "../auth/token.service.js";
import { SourceProvider } from "../generated/prisma/enums.js";
import { ConnectorResolver } from "../sync/connector.resolver.js";
import { SyncService } from "../sync/sync.service.js";

import { SourceRepository } from "./source.repository.js";

type PendingAuthorization = {
  provider: OAuthProviderName;
  startedAt: number;
  // The workspace open when the grant started. The callback carries no workspace of its own.
  workspaceId: string;
};

@Injectable()
export class SourcesService {
  // The extensions the filesystem connector reads as text. It stores any other file as an unindexed attachment.
  private readonly uploadFileExtensions = [
    ".csv",
    ".json",
    ".md",
    ".mdx",
    ".sql",
    ".txt",
    ".yaml",
    ".yml",
  ];
  // One process holds the OAuth state values. A restart between the authorize step and the callback fails the grant.
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>();

  constructor(
    private readonly connectorResolver: ConnectorResolver,
    private readonly oauthRegistry: OAuthRegistry,
    private readonly sourceRepository: SourceRepository,
    private readonly syncService: SyncService,
    private readonly tokenService: TokenService,
  ) {}

  /** The directory the filesystem connector reads for one workspace. A second workspace never lists these files. */
  private readUploadDirectory(workspaceId: string): string {
    return resolve(process.env.UPLOAD_ROOT || ".uploads", workspaceId);
  }

  async listSources(workspaceId: string): Promise<Source[]> {
    const sources = await this.sourceRepository.listSources(workspaceId);

    return sources.map((source) => ({
      ...source,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
    }));
  }

  async listDocuments(
    workspaceId: string,
    sourceId: string,
  ): Promise<SourceDocument[]> {
    const source = await this.sourceRepository.findSource(workspaceId, sourceId);
    if (source === null) {
      throw new NotFoundException("The source does not exist.");
    }

    const documents = await this.sourceRepository.listDocuments(sourceId);

    return documents.map((document) => ({
      ...document,
      externalUpdatedAt: document.externalUpdatedAt.toISOString(),
      lastIndexedAt: document.lastIndexedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Report the upload directory and the state of each OAuth provider.
   *
   * A provider is configured when its client id, client secret and redirect URI are all present. The
   * detail of an unconfigured provider names the variables to set.
   */
  readConnectorStatus(workspaceId: string): ReadConnectorStatusResponse {
    const providers = [
      SourceProvider.notion,
      SourceProvider.confluence,
    ].map((provider) => {
      if (provider === SourceProvider.confluence) {
        return {
          provider,
          connectable: false,
          detail:
            "A Confluence source reads one space, and the space picker is not built yet.",
        };
      }

      try {
        this.oauthRegistry.createClient(provider);
        return { provider, connectable: true, detail: null };
      } catch (error) {
        return {
          provider,
          connectable: false,
          detail: error instanceof Error ? error.message : "The provider is not configured.",
        };
      }
    });

    return {
      uploads: {
        directory: this.readUploadDirectory(workspaceId),
        fileExtensions: this.uploadFileExtensions,
      },
      providers,
    };
  }

  /**
   * Write every uploaded file into the upload directory, then sync the directory.
   *
   * A file that carries the name of a stored file replaces it, and the sync pass re-embeds that document.
   * The method returns after the whole pass finishes, so the caller can read the new counts at once.
   */
  async saveUploads(
    workspaceId: string,
    files: readonly UploadedFile[],
  ): Promise<SaveUploadsResponse> {
    const uploadDirectory = this.readUploadDirectory(workspaceId);
    const fileNames = files.map((file) => {
      const fileName = basename(file.name.trim());
      if (
        fileName === "" ||
        fileName.startsWith(".") ||
        !/^[A-Za-z0-9 ._-]+$/.test(fileName)
      ) {
        throw new BadRequestException(
          `"${file.name}" must be a file name of letters, digits, spaces, dots, hyphens or underscores.`,
        );
      }
      if (!this.uploadFileExtensions.includes(extname(fileName).toLowerCase())) {
        throw new BadRequestException(
          `"${fileName}" must end in ${this.uploadFileExtensions.join(", ")}.`,
        );
      }

      return fileName;
    });

    await mkdir(uploadDirectory, { recursive: true });
    for (const [index, file] of files.entries()) {
      await writeFile(join(uploadDirectory, fileNames[index]), file.text, "utf8");
    }

    const source = await this.sourceRepository.saveFilesystemSource(
      workspaceId,
      uploadDirectory,
      "Uploads",
    );
    await this.syncService.sync(source.id);

    return { sourceId: source.id };
  }

  async syncSource(workspaceId: string, sourceId: string): Promise<void> {
    const source = await this.sourceRepository.findSource(workspaceId, sourceId);
    if (source === null) {
      throw new NotFoundException("The source does not exist.");
    }

    await this.syncService.sync(sourceId);
  }

  /**
   * Whether this source reads the upload directory of this workspace, the one directory this API writes.
   *
   * A filesystem source that reads any other path holds files this app did not create, such as a mounted
   * host directory, so no delete route may unlink them.
   */
  private isManagedUploadDirectory(
    workspaceId: string,
    source: { provider: SourceProvider; externalId: string },
  ): boolean {
    return (
      source.provider === SourceProvider.filesystem &&
      source.externalId === this.readUploadDirectory(workspaceId)
    );
  }

  /**
   * Delete one source with its documents and chunks, and delete the uploaded files behind it.
   *
   * The files go first. A failed delete then leaves rows whose files are gone, which the next sync pass
   * sweeps. The reverse order would leave indexed files that the next upload imports again.
   */
  async deleteSource(workspaceId: string, sourceId: string): Promise<void> {
    const source = await this.sourceRepository.findSource(workspaceId, sourceId);
    if (source === null) {
      throw new NotFoundException("The source does not exist.");
    }

    if (this.isManagedUploadDirectory(workspaceId, source)) {
      await rm(source.externalId, { force: true, recursive: true });
    }
    await this.sourceRepository.deleteSource(workspaceId, sourceId);
  }

  /**
   * Delete one uploaded file, and the document and chunks that index it.
   *
   * Only the uploads of this workspace go. A Notion or Confluence document returns on the next sync pass
   * because the provider still serves it, and a filesystem source that reads any other directory holds
   * files this app did not create.
   */
  async deleteDocument(
    workspaceId: string,
    sourceId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.sourceRepository.findDocument(
      workspaceId,
      sourceId,
      documentId,
    );
    if (document === null) {
      throw new NotFoundException("The document does not exist.");
    }
    if (document.source.provider !== SourceProvider.filesystem) {
      throw new BadRequestException(
        `Delete this document in ${document.source.provider}, then sync the source.`,
      );
    }
    if (!this.isManagedUploadDirectory(workspaceId, document.source)) {
      throw new BadRequestException(
        "This source reads a directory outside the uploads of this workspace, so its files stay.",
      );
    }

    const connector = await this.connectorResolver.resolveConnector(sourceId);
    if (!isDeletableConnector(connector)) {
      throw new BadRequestException("This source cannot delete a document.");
    }

    await connector.deleteDocument(document.externalId);
    await this.sourceRepository.deleteDocument(workspaceId, sourceId, documentId);
  }

  /** Return the provider URL where the user grants access, and remember the state value the callback must return. */
  startAuthorization(workspaceId: string, provider: SourceProvider): string {
    if (provider !== SourceProvider.notion) {
      throw new BadRequestException(`KnowledgeStack cannot connect ${provider} yet.`);
    }

    const state = randomBytes(24).toString("base64url");
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [pendingState, pending] of this.pendingAuthorizations) {
      if (pending.startedAt < tenMinutesAgo) {
        this.pendingAuthorizations.delete(pendingState);
      }
    }
    this.pendingAuthorizations.set(state, { provider, startedAt: Date.now(), workspaceId });

    return this.oauthRegistry.createClient(provider).buildAuthorizationUrl(state).toString();
  }

  /**
   * Exchange the authorization code, store the encrypted tokens, and create a source for every resource the
   * grant covers. A second grant for the same workspace updates the stored credential instead of adding one.
   */
  async completeAuthorization(code: string, state: string): Promise<void> {
    const pending = this.pendingAuthorizations.get(state);
    if (pending === undefined) {
      throw new BadRequestException("The state value does not match a started authorization.");
    }
    this.pendingAuthorizations.delete(state);

    const grant = await this.oauthRegistry
      .createClient(pending.provider)
      .exchangeAuthorizationCode(code);
    const credential = await this.sourceRepository.saveCredential(
      pending.workspaceId,
      pending.provider,
      {
        externalId: grant.credential.externalId,
        externalDisplayName: grant.credential.externalDisplayName,
        externalUserId: grant.credential.externalUserId,
        externalUserEmail: grant.credential.externalUserEmail,
        encryptedAccessToken: this.tokenService.encrypt(grant.tokens.accessToken),
        encryptedRefreshToken:
          grant.tokens.refreshToken === null
            ? null
            : this.tokenService.encrypt(grant.tokens.refreshToken),
        expiresAt: grant.tokens.expiresAt,
        scope: grant.tokens.scope,
      },
    );

    for (const resource of grant.resources) {
      await this.sourceRepository.saveOAuthSource(
        pending.workspaceId,
        pending.provider,
        credential.id,
        resource,
      );
    }
  }
}
