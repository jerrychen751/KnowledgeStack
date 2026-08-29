"use client";

import { useCallback, useState } from "react";

import type { Chat, ListChatsResponse } from "@knowledgestack/api-contract/chat";

import { RedirectError, requestJson, sendJson } from "@/lib/api-client";

/** Hold the rows of the chat list, newest chat first.
 *
 * The hook never reads on its own. `AskPage` calls `refreshChats` from one effect, because only that page knows when a chat opens and when an answer finishes. `deleteChat` returns true when the row is gone, and false when the request failed. Both write `listFailure`, which is the empty string until a request fails.
 */
export function useChatList(): {
  chats: Chat[];
  listFailure: string;
  refreshChats: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<boolean>;
} {
  const [chats, setChats] = useState<Chat[]>([]);
  const [listFailure, setListFailure] = useState("");

  const refreshChats = useCallback(async () => {
    try {
      const body = await requestJson<ListChatsResponse>("/api/chat");
      setChats(body.chats);
      setListFailure("");
    } catch (error) {
      if (!(error instanceof RedirectError)) {
        setListFailure(error instanceof Error ? error.message : "The chats did not load.");
      }
    }
  }, []);

  const deleteChat = useCallback(
    async (chatId: string) => {
      try {
        await sendJson(`/api/chat/${chatId}`, "DELETE");
        setListFailure("");
      } catch (error) {
        if (error instanceof RedirectError) {
          return false;
        }

        setListFailure(error instanceof Error ? error.message : "The chat did not delete.");
        await refreshChats();

        return false;
      }

      await refreshChats();

      return true;
    },
    [refreshChats],
  );

  return { chats, listFailure, refreshChats, deleteChat };
}
