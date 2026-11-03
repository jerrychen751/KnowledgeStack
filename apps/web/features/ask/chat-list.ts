import { Component, input, output, signal } from "@angular/core";

import type { Chat } from "@knowledgestack/api-contract/chat";

import { formatTime } from "@/lib/format-time";

/** The left column: one row per stored chat, newest first, above a New chat button. A row with an empty title reads "New chat", because the API writes the title from the first question and the row exists before that question finishes. The row at `openChatId` is the open one. A click on the delete control turns that one row into a confirm, and only one row confirms at a time. */
@Component({
  selector: "nav[ksChatList]",
  host: { class: "ask-chat-list", "aria-label": "Chats" },
  templateUrl: "./chat-list.html",
})
export class ChatList {
  readonly chats = input.required<Chat[]>();
  readonly openChatId = input.required<string | null>();
  readonly listFailure = input.required<string>();
  readonly open = output<string | null>();
  readonly delete = output<string>();
  protected readonly confirmingChatId = signal<string | null>(null);
  protected readonly formatTime = formatTime;
}
