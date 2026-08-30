"use client";

import { useState, type ReactNode } from "react";

import type { Chat } from "@knowledgestack/shared/chat";

import { formatTime } from "@/lib/format-time";

import styles from "./ask.module.css";

/** The left column: one row per stored chat, newest first, above a New chat button. A row with an empty title reads "New chat", because the API writes the title from the first question and the row exists before that question finishes. The row at `openChatId` is the open one. A click on the delete control turns that one row into a confirm, and only one row confirms at a time. */
export function ChatList({
  chats,
  openChatId,
  listFailure,
  onOpen,
  onDelete,
}: {
  chats: Chat[];
  openChatId: string | null;
  listFailure: string;
  onOpen: (chatId: string | null) => void;
  onDelete: (chatId: string) => void;
}): ReactNode {
  const [confirmingChatId, setConfirmingChatId] = useState<string | null>(null);

  return (
    <nav className={styles.chatList} aria-label="Chats">
      <div className={styles.chatListHead}>
        <button type="button" className={styles.newChat} onClick={() => onOpen(null)}>
          <span className={styles.newChatMark} aria-hidden="true">
            +
          </span>
          New chat
        </button>
      </div>

      <div className={styles.chatListBody}>
        {listFailure === "" ? null : <p className={styles.chatListFailure}>{listFailure}</p>}
        {chats.length === 0 && listFailure === "" ? (
          <p className={styles.chatListEmpty}>No chat yet.</p>
        ) : null}

        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`${styles.chatRow} ${chat.id === openChatId ? styles.chatRowActive : ""}`}
          >
            <button
              type="button"
              className={styles.chatOpen}
              aria-current={chat.id === openChatId ? "page" : undefined}
              onClick={() => onOpen(chat.id)}
            >
              <span className={styles.chatTitle}>
                {chat.title === "" ? "New chat" : chat.title}
              </span>
              <span className={styles.chatTime}>{formatTime(chat.updatedAt)}</span>
            </button>

            {chat.id === confirmingChatId ? (
              <span className={styles.chatConfirm}>
                <button
                  type="button"
                  className={styles.chatConfirmDelete}
                  onClick={() => {
                    setConfirmingChatId(null);
                    onDelete(chat.id);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className={styles.chatConfirmCancel}
                  onClick={() => setConfirmingChatId(null)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={styles.chatDelete}
                aria-label={`Delete ${chat.title === "" ? "this chat" : chat.title}`}
                onClick={() => setConfirmingChatId(chat.id)}
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
