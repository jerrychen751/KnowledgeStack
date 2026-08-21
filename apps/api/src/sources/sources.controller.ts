import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Redirect,
} from "@nestjs/common";

import type { AuthorizationUrlResponse } from "@knowledgestack/shared/auth";
import type { StatusResponse } from "@knowledgestack/shared/http";
import type {
  ConnectorStatusResponse,
  SourceDocumentListResponse,
  SourceListResponse,
  UploadResponse,
  UploadedFile,
} from "@knowledgestack/shared/sources";

import { Public } from "../auth/public.decorator.js";
import { ActiveWorkspaceId } from "../auth/session.decorator.js";
import { AppConfig } from "../config/app-config.js";
import { SourceProvider } from "../generated/prisma/enums.js";

import { SourcesService } from "./sources.service.js";

@Controller("sources")
export class SourcesController {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly sourcesService: SourcesService,
  ) {}

  @Get()
  async listSources(@ActiveWorkspaceId() workspaceId: string): Promise<SourceListResponse> {
    return { sources: await this.sourcesService.listSources(workspaceId) };
  }

  @Get("connectors")
  readConnectorStatus(@ActiveWorkspaceId() workspaceId: string): ConnectorStatusResponse {
    return this.sourcesService.readConnectorStatus(workspaceId);
  }

  @Get(":sourceId/documents")
  async listDocuments(
    @Param("sourceId") sourceId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<SourceDocumentListResponse> {
    return {
      documents: await this.sourcesService.listDocuments(workspaceId, sourceId),
    };
  }

  private readUploadedFiles(body: unknown): UploadedFile[] {
    const files = (body as { files?: unknown } | null)?.files;
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException("files must be a non-empty array.");
    }
    if (files.length > 20) {
      throw new BadRequestException("files must hold 20 entries or fewer.");
    }

    return files.map((file) => {
      const name = (file as { name?: unknown }).name;
      const text = (file as { text?: unknown }).text;
      if (typeof name !== "string" || typeof text !== "string") {
        throw new BadRequestException("Each file must carry a name string and a text string.");
      }
      if (text.length > 1_000_000) {
        throw new BadRequestException(`"${name}" must hold 1000000 characters or fewer.`);
      }

      return { name, text };
    });
  }

  /** Store the uploaded files and sync them. The response arrives after the whole sync pass finishes. */
  @Post("uploads")
  async saveUploads(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<UploadResponse> {
    const files = this.readUploadedFiles(body);
    try {
      return await this.sourcesService.saveUploads(workspaceId, files);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "The sync pass failed.",
      );
    }
  }

  @Post(":sourceId/sync")
  @HttpCode(200)
  async syncSource(
    @Param("sourceId") sourceId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<StatusResponse> {
    try {
      await this.sourcesService.syncSource(workspaceId, sourceId);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "The sync pass failed.",
      );
    }

    return { status: "ok" };
  }

  /** Delete one uploaded file with the document and chunks that index it. Filesystem sources only. */
  @Delete(":sourceId/documents/:documentId")
  @HttpCode(200)
  async deleteDocument(
    @Param("sourceId") sourceId: string,
    @Param("documentId") documentId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<StatusResponse> {
    try {
      await this.sourcesService.deleteDocument(workspaceId, sourceId, documentId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "The file did not delete.",
      );
    }

    return { status: "ok" };
  }

  @Delete(":sourceId")
  @HttpCode(200)
  async deleteSource(
    @Param("sourceId") sourceId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<StatusResponse> {
    await this.sourcesService.deleteSource(workspaceId, sourceId);
    return { status: "ok" };
  }

  /** Return the provider URL where the user grants access. The browser leaves the app to open it. */
  @Get("connect/:provider")
  startAuthorization(
    @Param("provider") provider: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): AuthorizationUrlResponse {
    if (!Object.hasOwn(SourceProvider, provider)) {
      throw new BadRequestException(`"${provider}" is not a source provider.`);
    }

    return {
      authorizeUrl: this.sourcesService.startAuthorization(
        workspaceId,
        provider as SourceProvider,
      ),
    };
  }

  /**
   * Finish the grant the provider redirected back to, then return the browser to the sources page.
   *
   * The provider console must hold this route as the redirect URI, such as
   * http://127.0.0.1:3001/sources/oauth/callback.
   *
   * The route stays open, because the state value carries the workspace and a session that expired during
   * the grant would otherwise end the browser on a 401 instead of on the sources page.
   */
  @Public()
  @Get("oauth/callback")
  @Redirect()
  async completeAuthorization(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
  ) {
    if (error !== undefined) {
      return {
        url: `${this.appConfig.webAppUrl}/sources?error=${encodeURIComponent(error)}`,
      };
    }
    if (code === undefined || state === undefined) {
      throw new BadRequestException("The callback needs a code and a state value.");
    }

    try {
      await this.sourcesService.completeAuthorization(code, state);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "The grant failed.";
      return {
        url: `${this.appConfig.webAppUrl}/sources?error=${encodeURIComponent(message)}`,
      };
    }

    return { url: `${this.appConfig.webAppUrl}/sources?connected=1` };
  }
}
