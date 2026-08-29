import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from "@nestjs/common";

import {
  createTurnRequestSchema,
  type ChatStreamEvent,
  type CreateChatResponse,
  type ListChatsResponse,
  type ListModelsResponse,
  type ReadChatResponse,
} from "@knowledgestack/api-contract/chat";
import type { StatusResponse } from "@knowledgestack/api-contract/http";

import { ActiveWorkspaceId, CurrentSession } from "../auth/session.decorator.js";
import type { RequestSession } from "../auth/session.service.js";

import { ChatService } from "./chat.service.js";

// The Express response, narrowed to the calls this controller makes. @types/express is not a dependency.
type StreamingResponse = {
  end(): void;
  flushHeaders(): void;
  on(event: "close", listener: () => void): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
};

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Report the models a question can run on, and the one the API uses when the request names none. Nest matches in declaration order, so this route must stay above the ones that read :chatId. */
  @Get("models")
  listModels(): ListModelsResponse {
    return {
      modelIds: this.chatService.modelIds,
      defaultModelId: this.chatService.modelIds[0],
    };
  }

  @Get()
  async listChats(
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<ListChatsResponse> {
    return { chats: await this.chatService.listChats(workspaceId, session.userId) };
  }

  /** Open one empty chat. The browser calls this before the first question and puts the id in the URL. */
  @Post()
  async createChat(
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<CreateChatResponse> {
    return { chat: await this.chatService.createChat(workspaceId, session.userId) };
  }

  @Get(":chatId")
  async readChat(
    @Param("chatId") chatId: string,
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<ReadChatResponse> {
    return this.chatService.readChat(workspaceId, session.userId, chatId);
  }

  @Delete(":chatId")
  @HttpCode(200)
  async deleteChat(
    @Param("chatId") chatId: string,
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
  ): Promise<StatusResponse> {
    await this.chatService.deleteChat(workspaceId, session.userId, chatId);

    return { status: "ok" };
  }

  /**
   * Add one turn to the chat and stream the answer as Server-Sent Events.
   *
   * Every frame is one JSON object on a `data:` line. An answer can send `tool`, `citations`, `rows`,
   * `delta`, `compaction` and `context` frames. It then sends `done` on success or `error` on failure. The
   * client must treat a stream that ends without `done` as a failure, because the headers leave before the
   * first search.
   *
   * A closed browser ends the loop through the `close` listener. A write to a closed socket does not stop a
   * `for await` loop by itself, so without that listener the answer runs to the end and pays for every model
   * call.
   */
  @Post(":chatId/turns")
  async createTurn(
    @Param("chatId") chatId: string,
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
    @CurrentSession() session: RequestSession,
    @Res() response: StreamingResponse,
  ): Promise<void> {
    const parsed = createTurnRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }

    const { question, modelId: requestedModelId } = parsed.data;
    const modelIds = this.chatService.modelIds;
    const modelId =
      requestedModelId === undefined || requestedModelId === null || requestedModelId === ""
        ? modelIds[0]
        : requestedModelId;
    if (!modelIds.includes(modelId)) {
      throw new BadRequestException(`modelId must be one of ${modelIds.join(", ")}.`);
    }

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    let isClosed = false;
    response.on("close", () => {
      isClosed = true;
    });

    try {
      for await (const event of this.chatService.streamTurn(
        workspaceId,
        session.userId,
        chatId,
        question,
        modelId,
      )) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
        if (isClosed) {
          break;
        }
      }
      response.write(
        `data: ${JSON.stringify({ type: "done" } satisfies ChatStreamEvent)}\n\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The answer failed.";
      response.write(
        `data: ${JSON.stringify({ type: "error", message } satisfies ChatStreamEvent)}\n\n`,
      );
    } finally {
      response.end();
    }
  }
}
