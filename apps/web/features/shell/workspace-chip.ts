import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";

import { AccountContext } from "./account-context";

/** The workspace the browser reads, beside the wordmark. Every page under the nav reads this workspace, so it sits left of the links and not with the account. A click opens /workspaces, where the person picks another. */
@Component({
  selector: "ks-workspace-chip",
  host: { style: "display: contents" },
  imports: [RouterLink],
  template: `
    @if (accountContext.account(); as account) {
      <a routerLink="/workspaces" class="shell-workspace">{{ account.activeWorkspace?.name ?? "Choose a workspace" }}</a>
    }
  `,
})
export class WorkspaceChip {
  protected readonly accountContext = inject(AccountContext);
}
