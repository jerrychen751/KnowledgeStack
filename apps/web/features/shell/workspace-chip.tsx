"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useAccount } from "./account-context";
import styles from "./shell.module.css";

/** The workspace the browser reads, beside the wordmark. Every page under the nav reads this workspace, so it sits left of the links and not with the account. A click opens /workspaces, where the person picks another. */
export function WorkspaceChip(): ReactNode {
  const account = useAccount();
  if (account === null) {
    return null;
  }

  return (
    <Link href="/workspaces" className={styles.workspace}>
      {account.activeWorkspace?.name ?? "Choose a workspace"}
    </Link>
  );
}
