import Link from "next/link";
import type { ReactNode } from "react";

import type { Workspace } from "@knowledgestack/api-contract/workspaces";

import { Button } from "@/components/button";
import { CheckMark } from "@/components/check-mark";

import styles from "./workspaces.module.css";

/** One workspace in the list: its counts, the Open button, the join code a member needs, and Leave. The card of the open workspace shows a badge in place of Open, and links to the two pages that read it. `armedId` names the workspace whose next click leaves it, and is null when nothing is armed. Leaving takes two clicks, because it revokes every MCP token this person made for that workspace. */
export function WorkspaceCard({
  workspace,
  isActive,
  isBusy,
  armedId,
  onArm,
  onOpen,
  isCopied,
  onCopyCode,
  onLeave,
}: {
  workspace: Workspace;
  isActive: boolean;
  isBusy: boolean;
  armedId: string | null;
  onArm: (id: string | null) => void;
  onOpen: () => void;
  isCopied: boolean;
  onCopyCode: () => void;
  onLeave: () => void;
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
        <div className={styles.cardActions}>
          {armedId === workspace.id ? (
            <>
              <Button disabled={isBusy} onClick={onLeave}>
                Leave for good
              </Button>
              <Button disabled={isBusy} onClick={() => onArm(null)}>
                Stay
              </Button>
            </>
          ) : (
            <>
              {isActive ? (
                <span className={styles.openBadge}>Open</span>
              ) : (
                <Button disabled={isBusy} onClick={onOpen}>
                  Open
                </Button>
              )}
              <Button disabled={isBusy} onClick={() => onArm(workspace.id)}>
                Leave
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={styles.cardFoot}>
        <p className={styles.codeLabel}>Join code</p>
        <code className={styles.code}>{workspace.joinCode}</code>
        <button
          type="button"
          className={`${styles.copyButton} ${isCopied ? styles.copyButtonDone : ""}`}
          onClick={onCopyCode}
        >
          {isCopied ? (
            <>
              <CheckMark />
              Copied
            </>
          ) : (
            "Copy"
          )}
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
