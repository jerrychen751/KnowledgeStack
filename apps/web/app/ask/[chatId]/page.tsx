import type { ReactNode } from "react";

import { AskPage } from "@/features/ask/ask-page";

/** One stored chat. `/` opens an empty one, and the hook replaces the URL with this route after the first question. */
export default async function StoredChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}): Promise<ReactNode> {
  const { chatId } = await params;

  return <AskPage chatId={chatId} />;
}
