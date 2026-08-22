import { BadRequestException, Body, Controller, Get, Post, Res } from "@nestjs/common";

import type {
  ChatMessage,
  ChatStreamEvent,
  ListModelsResponse,
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
  listModels(): ListModelsResponse {
    return {
      models: this.chatService.models,
      defaultModelId: this.chatService.models[0],
    };
  }

  private readModelId(body: unknown): string {
    const modelId = (body as { model?: unknown } | null)?.model;
    if (modelId === undefined || modelId === null || modelId === "") {
      return this.chatService.models[0];
    }
    if (typeof modelId !== "string" || !this.chatService.models.includes(modelId)) {
      throw new BadRequestException(
        `model must be one of ${this.chatService.models.join(", ")}.`,
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

  /** Read the notes a compaction of an earlier answer wrote, or an empty string when the conversation never compacted. */
  private readSummary(body: unknown): string {
    const summary = (body as { summary?: unknown } | null)?.summary;
    if (summary === undefined || summary === null) {
      return "";
    }
    if (typeof summary !== "string") {
      throw new BadRequestException("summary must be a string.");
    }

    return summary;
  }

  /**
   * Stream the answer to the last message as Server-Sent Events.
   *
   * Every frame is one JSON object on a `data:` line. The `type` field is `tool`, `citations`, `delta`,
   * `compaction` or `context` while the answer runs, then `done` on success or `error` on failure. The client
   * must treat a stream that ends without `done` as a failure, because the headers leave before the first
   * search starts. A client that discards a `compaction` frame keeps sending the turns the frame summarized,
   * and the next question compacts them again.
   */
  @Post()
  async streamAnswer(
    @Body() body: unknown,
    @ActiveWorkspaceId() workspaceId: string,
    @Res() response: StreamingResponse,
  ): Promise<void> {
    const messages = this.readChatMessages(body);
    const modelId = this.readModelId(body);
    const summary = this.readSummary(body);

    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    try {
      for await (const event of this.chatService.streamAnswer(workspaceId, messages, modelId, summary)) {
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
