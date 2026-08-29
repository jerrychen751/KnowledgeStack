import type { ReactNode } from "react";

import { AskPage } from "@/features/ask/ask-page";

/** A new chat. The hook opens the chat row on the first question and replaces the URL with /ask/<chatId>. */
export default function NewChatPage(): ReactNode {
  return <AskPage chatId={null} />;
}
