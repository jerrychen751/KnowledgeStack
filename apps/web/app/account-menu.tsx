"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { FindAccountResponse } from "@knowledgestack/shared/auth";

import styles from "./shell.module.css";

/** The workspaces page opens another workspace without a navigation, and the header follows this event. */
export const workspaceChangedEvent = "knowledgestack:workspace-changed";

export function AccountMenu(): ReactNode {
  const [account, setAccount] = useState<FindAccountResponse | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let isCurrent = true;
    const readAccount = () => {
      fetch("/api/auth/session")
        .then((response) => (response.ok ? (response.json() as Promise<FindAccountResponse>) : null))
        .then((body) => {
          if (isCurrent) {
            setAccount(body);
          }
        })
        .catch(() => {
          if (isCurrent) {
            setAccount(null);
          }
        });
    };

    readAccount();
    window.addEventListener(workspaceChangedEvent, readAccount);

    return () => {
      isCurrent = false;
      window.removeEventListener(workspaceChangedEvent, readAccount);
    };
  }, [pathname]);

  if (account === null) {
    return null;
  }

  return (
    <div className={styles.account}>
      <Link href="/workspaces" className={styles.workspace}>
        {account.activeWorkspace?.name ?? "Choose a workspace"}
      </Link>
      <span className={styles.identity}>
        {account.user.externalImageUrl === null ? null : (
          <img
            className={styles.avatar}
            src={account.user.externalImageUrl}
            alt=""
            width={22}
            height={22}
          />
        )}
        <span className={styles.email}>{account.user.externalEmail}</span>
      </span>
      <button
        type="button"
        className={styles.signOut}
        onClick={async () => {
          await fetch("/api/auth/signout", { method: "POST" });
          window.location.assign("/signin");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
