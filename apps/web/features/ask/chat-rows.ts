import { signal } from "@angular/core";

import type { Chat, ListChatsResponse } from "@knowledgestack/api-contract/chat";

import { RedirectError, requestJson, sendJson } from "@/lib/api-client";

/** Hold the rows of the chat list, newest chat first.
 *
 * The class never reads on its own. `AskPage` calls `refreshChats` from one effect, because only that page knows when a chat opens and when an answer finishes. `deleteChat` returns true when the row is gone, and false when the request failed. Both write `listFailure`, which is the empty string until a request fails.
 */
export class ChatRows {
  readonly chats = signal<Chat[]>([]);
  readonly listFailure = signal("");

  async refreshChats(): Promise<void> {
    try {
      const body = await requestJson<ListChatsResponse>("/api/chat");
      this.chats.set(body.chats);
      this.listFailure.set("");
    } catch (error) {
      if (!(error instanceof RedirectError)) {
        this.listFailure.set(error instanceof Error ? error.message : "The chats did not load.");
      }
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    try {
      await sendJson(`/api/chat/${chatId}`, "DELETE");
      this.listFailure.set("");
    } catch (error) {
      if (error instanceof RedirectError) {
        return false;
      }

      this.listFailure.set(error instanceof Error ? error.message : "The chat could not be deleted.");
      await this.refreshChats();

      return false;
    }

    await this.refreshChats();

    return true;
  }
}
