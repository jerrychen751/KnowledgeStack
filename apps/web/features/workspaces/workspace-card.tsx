import Link from "next/link";
import type { ReactNode } from "react";

import type { Workspace } from "@knowledgestack/shared/workspaces";

import { Button } from "@/components/button";

import styles from "./workspaces.module.css";

/** One workspace in the list: its counts, the Open button, and the join code a member needs. The card of the open workspace shows a badge in place of Open, and links to the two pages that read it. */
export function WorkspaceCard({
  workspace,
  isActive,
  isBusy,
  onOpen,
  onCopyCode,
}: {
  workspace: Workspace;
  isActive: boolean;
  isBusy: boolean;
  onOpen: () => void;
  onCopyCode: () => void;
}): ReactNode {
  return (
    <li className={`${styles.card} ${isActive ? styles.cardActive : ""}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardIdentity}>
          <h2 className={styles.cardName}>{workspace.name}</h2>
          <p className={styles.cardStats}>
            <span>
              {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}
            </span>
            <span>
              {workspace.sourceCount} {workspace.sourceCount === 1 ? "source" : "sources"}
            </span>
          </p>
        </div>
        {isActive ? (
          <span className={styles.openBadge}>Open</span>
        ) : (
          <Button disabled={isBusy} onClick={onOpen}>
            Open
          </Button>
        )}
      </div>

      <div className={styles.cardFoot}>
        <p className={styles.codeLabel}>Join code</p>
        <code className={styles.code}>{workspace.joinCode}</code>
        <button type="button" className={styles.copyButton} onClick={onCopyCode}>
          Copy
        </button>
        {isActive ? (
          <span className={styles.cardLinks}>
            <Link href="/">Ask a question</Link>
            <Link href="/sources">Add sources</Link>
          </span>
        ) : null}
      </div>
    </li>
  );
}
