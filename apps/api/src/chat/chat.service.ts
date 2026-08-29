import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";

import type {
  Chat,
  ChatAnswerEvent,
  Citation,
  ContextUsage,
  QueryResult,
  Turn,
} from "@knowledgestack/api-contract/chat";

import { AgentLoop } from "./agent.loop.js";
import { ChatRepository } from "./chat.repository.js";
import { type ChatMessage, CompactionService } from "./compaction.service.js";

type ChatRow = Omit<Chat, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };

type TurnRow = Omit<Turn, "displayTexts" | "citations" | "queryResults"> & {
  displayTexts: unknown;
  citations: unknown;
  queryResults: unknown;
};

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly chatRepository: ChatRepository,
    private readonly compactionService: CompactionService,
  ) {}

  /** Every model a question can run on, cheapest first. The first entry answers a request that names none. */
  get modelIds(): readonly string[] {
    return this.agentLoop.modelIds;
  }

  /**
   * Move every turn left in the running state to error.
   *
   * No answer survives the process that ran it, so a running turn at startup belongs to a run that a restart
   * ended. One API container runs, so this sweep can read every workspace.
   */
  async onModuleInit(): Promise<void> {
    const count = await this.chatRepository.failEveryRunningTurn(
      "The answer stopped when the API restarted.",
    );
    if (count > 0) {
      Logger.log(`Failed ${count} turns left running by a restart.`, ChatService.name);
    }
  }

  private describeChat(chat: ChatRow): Chat {
    return {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    };
  }

  /** The API wrote every JSON column from a typed frame, so the read casts and never re-parses. */
  private describeTurn(turn: TurnRow): Turn {
    return {
      turnIndex: turn.turnIndex,
      question: turn.question,
      modelId: turn.modelId,
      displayTexts: turn.displayTexts as string[],
      citations: turn.citations as Citation[],
      queryResults: turn.queryResults as QueryResult[],
      answer: turn.answer,
      state: turn.state,
      errorMessage: turn.errorMessage,
    };
  }

  /**
   * Build the messages one answer runs on.
   *
   * The turns a compaction summarized stay out, because `summary` carries them. A turn with no answer sends
   * its question alone, and splitTurns reads that as a turn of one message.
   */
  private collectMessages(turns: readonly Turn[], compactedTurnCount: number): ChatMessage[] {
    return turns
      .slice(compactedTurnCount)
      .flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        { role: "assistant" as const, content: turn.answer },
      ])
      .filter((message) => message.content.trim() !== "");
  }

  async listChats(workspaceId: string, userId: string): Promise<Chat[]> {
    const chats = await this.chatRepository.listChats(workspaceId, userId);
    return chats.map((chat) => this.describeChat(chat));
  }

  async createChat(workspaceId: string, userId: string): Promise<Chat> {
    return this.describeChat(await this.chatRepository.createChat(workspaceId, userId));
  }

  /** Throws NotFoundException when this person holds no chat with that id in this workspace. */
  async deleteChat(workspaceId: string, userId: string, chatId: string): Promise<void> {
    const isDeleted = await this.chatRepository.deleteChat(workspaceId, userId, chatId);
    if (!isDeleted) {
      throw new NotFoundException("You hold no chat with that id in this workspace.");
    }
  }

  /** Read one chat with every turn it holds, and the size the next question starts from. */
  async readChat(
    workspaceId: string,
    userId: string,
    chatId: string,
  ): Promise<{ chat: Chat; turns: Turn[]; usage: ContextUsage }> {
    const chat = await this.chatRepository.readChatWithTurns(workspaceId, userId, chatId);
    if (chat === null) {
      throw new NotFoundException("You hold no chat with that id in this workspace.");
    }

    const turns = chat.turns.map((turn) => this.describeTurn(turn));

    return {
      chat: this.describeChat(chat),
      turns,
      usage: this.compactionService.measureUsage(
        chat.summary,
        this.collectMessages(turns, chat.compactedTurnCount),
      ),
    };
  }

  /**
   * Answer one question inside one chat, and write what the run produced.
   *
   * Every frame of AgentLoop reaches the caller unchanged. This method keeps a copy of each one, and its
   * `finally` block writes the turn on success, on a model failure, and on a disconnect. A `compaction`
   * frame writes the notes onto the chat at once, because the answer can still fail one line later.
   *
   * Throws ConflictException while the newest turn runs. A running turn older than 10 minutes belongs to no
   * live run, because the loop stops at 50 model calls of a few seconds each, so this method fails it and
   * continues. Two questions that pass that guard together race for the turn index, and the one that loses
   * throws the same ConflictException. The controller flushes the response headers before it reads this
   * generator, so both leave as an `error` frame on the stream and never as an HTTP status.
   */
  async *streamTurn(
    workspaceId: string,
    userId: string,
    chatId: string,
    question: string,
    modelId: string,
  ): AsyncGenerator<ChatAnswerEvent> {
    const chat = await this.chatRepository.readChatWithTurns(workspaceId, userId, chatId);
    if (chat === null) {
      throw new NotFoundException("You hold no chat with that id in this workspace.");
    }

    const newestTurn = chat.turns[chat.turns.length - 1];
    if (newestTurn !== undefined && newestTurn.state === "running") {
      const runningMinutes = (Date.now() - newestTurn.updatedAt.getTime()) / 60_000;
      if (runningMinutes < 10) {
        throw new ConflictException("This chat is still answering the question before this one.");
      }

      await this.chatRepository.failTurn(
        chatId,
        newestTurn.turnIndex,
        "The answer stopped before it finished.",
      );
    }

    const messages = this.collectMessages(
      chat.turns.map((turn) => this.describeTurn(turn)),
      chat.compactedTurnCount,
    );
    messages.push({ role: "user", content: question });

    const turnIndex = await this.chatRepository.createTurn(chatId, question, modelId);
    if (turnIndex === null) {
      throw new ConflictException("This chat is still answering the question before this one.");
    }

    const displayTexts: string[] = [];
    const citations: Citation[] = [];
    const queryResults: QueryResult[] = [];
    let answer = "";
    let state: "done" | "error" = "error";
    let errorMessage = "The answer stopped before it finished.";

    try {
      for await (const event of this.agentLoop.streamAnswer(
        workspaceId,
        messages,
        modelId,
        chat.summary,
      )) {
        if (event.type === "delta") {
          answer += event.text;
        } else if (event.type === "tool") {
          displayTexts.push(event.displayText);
        } else if (event.type === "citations") {
          citations.push(
            ...event.citations.filter(
              (citation) => !citations.some((held) => held.index === citation.index),
            ),
          );
        } else if (event.type === "rows") {
          queryResults.push({
            database: event.database,
            sql: event.sql,
            columns: event.columns,
            rows: event.rows,
          });
        } else if (event.type === "compaction") {
          displayTexts.push(
            `compacted ${event.turnCount} earlier ${event.turnCount === 1 ? "turn" : "turns"} into notes`,
          );
          await this.chatRepository.recordCompaction(
            chatId,
            event.summary,
            chat.compactedTurnCount + event.turnCount,
          );
        }

        yield event;
      }

      state = "done";
      errorMessage = "";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "The answer failed.";
      throw error;
    } finally {
      await this.chatRepository.completeTurn(chatId, turnIndex, {
        answer,
        displayTexts,
        citations,
        queryResults,
        state,
        errorMessage,
      });
    }
  }
}
