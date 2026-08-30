"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { FindAccountResponse } from "@knowledgestack/api-contract/auth";

import { requestJson } from "@/lib/api-client";
import { workspaceChangedEvent } from "@/lib/workspace-changed-event";

const AccountContext = createContext<FindAccountResponse | null>(null);

/**
 * Read the signed-in account once for the whole header.
 *
 * The workspace chip and the account menu sit at opposite ends of the header and both need this answer, so
 * one provider holds it and neither calls the API. It reads again on every page change, and on the
 * workspaceChangedEvent that /workspaces dispatches after a person opens another workspace.
 */
export function AccountProvider({ children }: { children: ReactNode }): ReactNode {
  const [account, setAccount] = useState<FindAccountResponse | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let isCurrent = true;
    const readAccount = () => {
      requestJson<FindAccountResponse>("/api/auth/session")
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

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

/** The signed-in account, or null while the first read is in flight and after a read that failed. */
export function useAccount(): FindAccountResponse | null {
  return useContext(AccountContext);
}
