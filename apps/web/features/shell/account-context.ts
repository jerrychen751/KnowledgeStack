import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, effect, inject, signal } from "@angular/core";

import type { FindAccountResponse } from "@knowledgestack/api-contract/auth";

import { requestJson } from "@/lib/api-client";
import { CurrentPath } from "@/lib/current-path";
import { workspaceChangedEvent } from "@/lib/workspace-changed-event";

/**
 * Read the signed-in account once for the whole header.
 *
 * The workspace chip and the account menu sit at opposite ends of the header and both need this answer, so
 * one service holds it and neither calls the API. It reads again on every page change, and on the
 * workspaceChangedEvent that /workspaces dispatches after a person opens another workspace.
 */
@Injectable({ providedIn: "root" })
export class AccountContext {
  /** The signed-in account, or null while the first read is in flight and after a read that failed. */
  readonly account = signal<FindAccountResponse | null>(null);
  private readonly currentPath = inject(CurrentPath);
  // Each read takes the next number, so an answer that arrives after a newer read began is dropped.
  private readCount = 0;

  constructor() {
    // The build bootstraps the app on the server to list its routes, where there is no window and no session.
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    effect(() => {
      this.currentPath.path();
      this.readAccount();
    });
    window.addEventListener(workspaceChangedEvent, () => this.readAccount());
  }

  private readAccount(): void {
    const read = ++this.readCount;
    requestJson<FindAccountResponse>("/api/auth/session")
      .then((body) => {
        if (read === this.readCount) {
          this.account.set(body);
        }
      })
      .catch(() => {
        if (read === this.readCount) {
          this.account.set(null);
        }
      });
  }
}
