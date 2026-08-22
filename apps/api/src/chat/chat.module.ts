/**
 * This module answers a question from the stored documents.
 *
 * The service runs one OpenAI chat model with every tool the tools module registered. The controller
 * streams every tool call, every retrieved chunk and every piece of answer text to the client as the model
 * produces them.
 *
 * CompactionService measures the conversation the browser sent and, once it reaches 100 turns or 256000
 * tokens, summarizes the oldest nine tenths of the turns into notes. The browser holds the conversation, so
 * the stream carries the notes back to it.
 */

import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module.js";
import { ToolsModule } from "../tools/tools.module.js";

import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";
import { CompactionService } from "./compaction.service.js";

@Module({
  imports: [AppConfigModule, ToolsModule],
  controllers: [ChatController],
  providers: [ChatService, CompactionService],
})
export class ChatModule {}
