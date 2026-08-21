/**
 * This module answers a question from the stored documents.
 *
 * The service runs one OpenAI chat model with a single tool, search_documents, which reaches the tools
 * module. The controller streams every search, every retrieved chunk and every piece of answer text to the
 * client as the model produces them.
 */

import { Module } from "@nestjs/common";

import { ToolsModule } from "../tools/tools.module.js";

import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [ToolsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
