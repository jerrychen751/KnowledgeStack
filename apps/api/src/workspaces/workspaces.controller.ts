import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import type { StatusResponse } from "@knowledgestack/api-contract/http";
import {
  createWorkspaceRequestSchema,
  joinWorkspaceRequestSchema,
  type CreateWorkspaceResponse,
  type JoinWorkspaceResponse,
  type ListWorkspacesResponse,
} from "@knowledgestack/api-contract/workspaces";

import { CurrentSession } from "../auth/session.decorator.js";
import { SessionService, type RequestSession } from "../auth/session.service.js";

import { WorkspacesService } from "./workspaces.service.js";

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly workspacesService: WorkspacesService,
  ) {}

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
    const parsed = createWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    const workspace = await this.workspacesService.createWorkspace(
      session.userId,
      parsed.data.name,
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
    const parsed = joinWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    const workspace = await this.workspacesService.joinWorkspace(
      session.userId,
      parsed.data.code,
    );
    await this.sessionService.selectWorkspace(session.sessionId, workspace.id);

    return { workspace };
  }

  /** Leave the workspace. Every MCP token this person created for it stops answering, because Postgres deletes each one with the membership. */
  @Delete(":workspaceId/membership")
  @HttpCode(200)
  async leaveWorkspace(
    @Param("workspaceId") workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<StatusResponse> {
    await this.workspacesService.leaveWorkspace(session.userId, workspaceId);

    return { status: "ok" };
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
