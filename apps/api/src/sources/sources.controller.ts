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
import { z } from "zod";

import type { StatusResponse } from "@knowledgestack/api-contract/http";
import {
  saveUploadsRequestSchema,
  sourceProviderSchema,
  type ListDocumentsResponse,
  type ListSourcesResponse,
  type ReadConnectorStatusResponse,
  type SaveUploadsResponse,
  type StartAuthorizationResponse,
} from "@knowledgestack/api-contract/sources";

import { Public } from "../auth/public.decorator.js";
import { ActiveWorkspaceId } from "../auth/session.decorator.js";
import { AppConfig } from "../config/app-config.js";

import { SourcesService } from "./sources.service.js";

@Controller("sources")
export class SourcesController {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly sourcesService: SourcesService,
  ) {}

  @Get()
  async listSources(@ActiveWorkspaceId() workspaceId: string): Promise<ListSourcesResponse> {
    return { sources: await this.sourcesService.listSources(workspaceId) };
  }

  @Get("connectors")
  readConnectorStatus(): ReadConnectorStatusResponse {
    return this.sourcesService.readConnectorStatus();
  }

  @Get(":sourceId/documents")
  async listDocuments(
    @Param("sourceId") sourceId: string,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<ListDocumentsResponse> {
    return {
      documents: await this.sourcesService.listDocuments(workspaceId, sourceId),
    };
  }

  /** Store the uploaded files and sync them. The response arrives after the whole sync pass finishes. */
  @Post("uploads")
  async saveUploads(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
  ): Promise<SaveUploadsResponse> {
    const parsed = saveUploadsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    try {
      return await this.sourcesService.saveUploads(workspaceId, parsed.data.files);
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

  /** Delete one uploaded file with the document and chunks that index it. Upload sources only. */
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
  ): StartAuthorizationResponse {
    const parsed = sourceProviderSchema.safeParse(provider);
    if (!parsed.success) {
      throw new BadRequestException(`"${provider}" is not a source provider.`);
    }

    return {
      authorizeUrl: this.sourcesService.startAuthorization(workspaceId, parsed.data),
    };
  }

  /**
   * Finish the grant the provider redirected back to, then return the browser to the sources page.
   *
   * The provider console must hold the web app path that forwards to this route as the redirect URI, such as
   * http://localhost:3000/api/sources/oauth/callback. Notion rejects an IP address here and accepts localhost.
   *
   * The route stays open, because the state value carries the workspace and a session that expired during
   * the grant would otherwise end the browser on a 401 instead of on the sources page.
   */
  @Public()
  @Get("oauth/callback")
  @Redirect()
  async completeAuthorization(@Query() query: unknown) {
    const parsed = z
      .object({
        code: z.string({ error: "code must be a string." }).optional(),
        state: z.string({ error: "state must be a string." }).optional(),
        error: z.string({ error: "error must be a string." }).optional(),
      })
      .safeParse(query);
    if (!parsed.success) {
      return {
        url: `${this.appConfig.webAppUrl}/sources?error=${encodeURIComponent(
          parsed.error.issues[0].message,
        )}`,
      };
    }

    const { code, state, error } = parsed.data;
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
