"use client";

import type { ReactNode } from "react";

import { sendJson } from "@/lib/api-client";

import { useAccount } from "./account-context";
import styles from "./shell.module.css";

export function AccountMenu(): ReactNode {
  const account = useAccount();
  if (account === null) {
    return null;
  }

  return (
    <div className={styles.account}>
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
          await sendJson("/api/auth/signout", "POST").catch(() => undefined);
          window.location.assign("/signin");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
