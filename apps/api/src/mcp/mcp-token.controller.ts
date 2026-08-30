import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";

import type { StatusResponse } from "@knowledgestack/api-contract/http";
import {
  createMcpTokenRequestSchema,
  type CreateMcpTokenResponse,
  type ListMcpTokensResponse,
} from "@knowledgestack/api-contract/mcp-tokens";

import { ActiveWorkspaceId, CurrentSession } from "../auth/session.decorator.js";
import type { RequestSession } from "../auth/session.service.js";
import { AppConfig } from "../config/app-config.js";

import { McpTokenService } from "./mcp-token.service.js";

@Controller("mcp-tokens")
export class McpTokenController {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly mcpTokenService: McpTokenService,
  ) {}

  /** Report the tokens this person made for the open workspace. A token another member made never appears. */
  @Get()
  async listMcpTokens(
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<ListMcpTokensResponse> {
    return { mcpTokens: await this.mcpTokenService.listMcpTokens(workspaceId, session.userId) };
  }

  /** Mint one token for the open workspace. The response carries the secret once, and no later read can return it. */
  @Post()
  async createMcpToken(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<CreateMcpTokenResponse> {
    const parsed = createMcpTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    const created = await this.mcpTokenService.createMcpToken(
      workspaceId,
      session.userId,
      parsed.data.name,
    );

    return { ...created, serverUrl: this.appConfig.mcpPublicUrl };
  }

  /** Revoke one token. Every client that holds it gets 401 on its next call. */
  @Delete(":mcpTokenId")
  @HttpCode(200)
  async deleteMcpToken(
    @Param("mcpTokenId") mcpTokenId: string,
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<StatusResponse> {
    await this.mcpTokenService.deleteMcpToken(workspaceId, session.userId, mcpTokenId);

    return { status: "ok" };
  }
}
