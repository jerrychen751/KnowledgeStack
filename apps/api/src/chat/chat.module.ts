/**
 * This module answers a question from the stored documents and registered databases, and it stores every
 * chat.
 *
 * AgentLoop runs one OpenAI chat model with every tool the tools module registered. ChatService owns the
 * `chats` and `turns` rows: it builds the messages from the stored turns, passes every frame of the loop to
 * the controller, and writes what the run produced. The controller streams each tool call, retrieved chunk,
 * database result and piece of answer text to the client. It sends each value when the model produces it.
 *
 * CompactionService measures those messages and, once they reach 100 turns or 256000 tokens, summarizes the
 * oldest nine tenths of the turns into notes. The chat row holds the notes, so a browser that misses the
 * frame loses nothing.
 */

import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ToolsModule } from "../tools/tools.module.js";

import { AgentLoop } from "./agent.loop.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";
import { CompactionService } from "./compaction.service.js";

@Module({
  imports: [AppConfigModule, PrismaModule, ToolsModule],
  controllers: [ChatController],
  providers: [AgentLoop, ChatRepository, ChatService, CompactionService],
})
export class ChatModule {}
