import { BadRequestException, Body, Controller, Get, Post, Res } from "@nestjs/common";

import type {
  ChatMessage,
  ChatModelListResponse,
  ChatStreamEvent,
} from "@knowledgestack/shared/chat";

import { ActiveWorkspaceId } from "../auth/session.decorator.js";

import { ChatService } from "./chat.service.js";

// The Express response, narrowed to the calls this controller makes. @types/express is not a dependency.
type StreamingResponse = {
  end(): void;
  flushHeaders(): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
};

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Report the models a question can run on, and the one the API uses when the request names none. */
  @Get("models")
  listModels(): ChatModelListResponse {
    return {
      models: this.chatService.models,
      defaultModelId: this.chatService.models[0].id,
    };
  }

  private readModelId(body: unknown): string {
    const modelId = (body as { model?: unknown } | null)?.model;
    if (modelId === undefined || modelId === null || modelId === "") {
      return this.chatService.models[0].id;
    }
    if (
      typeof modelId !== "string" ||
      !this.chatService.models.some((model) => model.id === modelId)
    ) {
      throw new BadRequestException(
        `model must be one of ${this.chatService.models.map((model) => model.id).join(", ")}.`,
      );
    }

    return modelId;
  }

  private readChatMessages(body: unknown): ChatMessage[] {
    const messages = (body as { messages?: unknown } | null)?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestException("messages must be a non-empty array.");
    }

    return messages.map((message) => {
      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") {
        throw new BadRequestException("Each message role must be user or assistant.");
      }
      if (typeof content !== "string" || content.trim() === "") {
        throw new BadRequestException("Each message content must be a non-empty string.");
      }

      return { role, content };
    });
  }

  /**
   * Stream the answer to the last message as Server-Sent Events.
   *
   * Every frame is one JSON object on a `data:` line. The `type` field is `search`, `citations` or `delta`
   * while the answer runs, then `done` on success or `error` on failure. The client must treat a stream that
   * ends without `done` as a failure, because the headers leave before the first search starts.
   */
  @Post()
  async streamAnswer(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
    @Res() response: StreamingResponse,
  ): Promise<void> {
    const messages = this.readChatMessages(body);
    const modelId = this.readModelId(body);

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    try {
      for await (const event of this.chatService.streamAnswer(workspaceId, messages, modelId)) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
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
