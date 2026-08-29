import { Injectable } from "@nestjs/common";

import type { Citation, QueryResult } from "@knowledgestack/shared/chat";

import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The columns every chat route may answer with. The turns of a chat come from readChatWithTurns alone. */
const chatColumns = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Every query the chat routes and the answer stream make. */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listChats(workspaceId: string, userId: string) {
    return this.prisma.chat.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: "desc" },
      select: chatColumns,
    });
  }

  async createChat(workspaceId: string, userId: string) {
    return this.prisma.chat.create({
      data: { workspaceId, userId, title: "" },
      select: chatColumns,
    });
  }

  /** Read one chat with every turn, oldest first. Returns null when this person holds no chat with that id in this workspace. */
  async readChatWithTurns(workspaceId: string, userId: string, chatId: string) {
    return this.prisma.chat.findFirst({
      where: { id: chatId, workspaceId, userId },
      include: { turns: { orderBy: { turnIndex: "asc" } } },
    });
  }

  /** Delete one chat and every turn with it. Returns false when this person holds no chat with that id. */
  async deleteChat(workspaceId: string, userId: string, chatId: string): Promise<boolean> {
    const { count } = await this.prisma.chat.deleteMany({
      where: { id: chatId, workspaceId, userId },
    });

    return count > 0;
  }

  /**
   * Insert one turn in the running state and stamp the chat.
   *
   * The turn index comes from the turn count inside the transaction, so two writers cannot agree on it. The
   * primary key over the chat and the index rejects the second insert, and Prisma reports P2002.
   */
  async createTurn(chatId: string, question: string, modelId: string): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const turnIndex = await transaction.turn.count({ where: { chatId } });
      await transaction.turn.create({ data: { chatId, turnIndex, question, modelId } });
      await transaction.chat.update({
        where: { id: chatId },
        data: turnIndex === 0 ? { title: question.slice(0, 60) } : { updatedAt: new Date() },
      });

      return turnIndex;
    });
  }

  /** Write the notes of one compaction onto the chat, before the answer that produced them can fail. */
  async recordCompaction(chatId: string, summary: string, compactedTurnCount: number): Promise<void> {
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { summary, compactedTurnCount },
    });
  }

  /** Write what one run produced, whether it finished or not. */
  async completeTurn(
    chatId: string,
    turnIndex: number,
    turn: {
      answer: string;
      displayTexts: string[];
      citations: Citation[];
      queryResults: QueryResult[];
      state: "done" | "error";
      errorMessage: string;
    },
  ): Promise<void> {
    await this.prisma.turn.update({
      where: { chatId_turnIndex: { chatId, turnIndex } },
      data: {
        answer: turn.answer,
        displayTexts: turn.displayTexts,
        citations: turn.citations as unknown as Prisma.InputJsonValue,
        queryResults: turn.queryResults as unknown as Prisma.InputJsonValue,
        state: turn.state,
        errorMessage: turn.errorMessage,
      },
    });
  }

  /** Move one turn out of the running state. The staleness rule calls it for a run no process still owns. */
  async failTurn(chatId: string, turnIndex: number, errorMessage: string): Promise<void> {
    await this.prisma.turn.update({
      where: { chatId_turnIndex: { chatId, turnIndex } },
      data: { state: "error", errorMessage },
    });
  }

  /** Move every running turn of every chat out of the running state, and report how many. The boot sweep calls it. */
  async failEveryRunningTurn(errorMessage: string): Promise<number> {
    const { count } = await this.prisma.turn.updateMany({
      where: { state: "running" },
      data: { state: "error", errorMessage },
    });

    return count;
  }
}
