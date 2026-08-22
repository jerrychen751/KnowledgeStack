import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import type { StatusResponse } from "@knowledgestack/shared/http";
import type {
  CreateWorkspaceResponse,
  JoinWorkspaceResponse,
  ListWorkspacesResponse,
} from "@knowledgestack/shared/workspaces";

import { CurrentSession } from "../auth/session.decorator.js";
import { SessionService, type RequestSession } from "../auth/session.service.js";

import { WorkspacesService } from "./workspaces.service.js";

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  private readWorkspaceName(body: unknown): string {
    const name = (body as { name?: unknown } | null)?.name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new BadRequestException("name must be a non-empty string.");
    }
    if (name.trim().length > 60) {
      throw new BadRequestException("name must hold 60 characters or fewer.");
    }

    return name.trim();
  }

  @Get()
  async listWorkspaces(
    @CurrentSession() session: RequestSession,
  ): Promise<ListWorkspacesResponse> {
    return {
      workspaces: await this.workspacesService.listWorkspaces(session.userId),
      activeWorkspaceId: session.activeWorkspaceId,
    };
  }

  /** Create a workspace and open it in this browser. The response carries the code that invites the next member. */
  @Post()
  async createWorkspace(
    @Body() body: unknown,
    @CurrentSession() session: RequestSession,
  ): Promise<CreateWorkspaceResponse> {
    const workspace = await this.workspacesService.createWorkspace(
      session.userId,
      this.readWorkspaceName(body),
    );
    await this.sessionService.selectWorkspace(session.sessionId, workspace.id);

    return { workspace };
  }

  /** Join the workspace that carries the code and open it in this browser. */
  @Post("join")
  @HttpCode(200)
  async joinWorkspace(
    @Body() body: unknown,
    @CurrentSession() session: RequestSession,
  ): Promise<JoinWorkspaceResponse> {
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code !== "string" || code.trim() === "") {
      throw new BadRequestException("code must be a non-empty string.");
    }

    const workspace = await this.workspacesService.joinWorkspace(session.userId, code);
    await this.sessionService.selectWorkspace(session.sessionId, workspace.id);

    return { workspace };
  }

  /** Open another workspace of this person in this browser. Every other browser keeps the workspace it reads. */
  @Post(":workspaceId/select")
  @HttpCode(200)
  async selectWorkspace(
    @Param("workspaceId") workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<StatusResponse> {
    if (!(await this.workspacesService.isMember(session.userId, workspaceId))) {
      throw new NotFoundException("The workspace does not exist.");
    }
    await this.sessionService.selectWorkspace(session.sessionId, workspaceId);

    return { status: "ok" };
  }
}
