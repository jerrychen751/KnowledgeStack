import { Component, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";

import type { Workspace } from "@knowledgestack/api-contract/workspaces";

import { Button } from "@/components/button";
import { CheckMark } from "@/components/check-mark";

/** One workspace in the list: its counts, the Open button, the join code a member needs, and Leave. The card of the open workspace shows a badge in place of Open, and links to the two pages that read it. `armedId` names the workspace whose next click leaves it, and is null when nothing is armed. Leaving takes two clicks, because it revokes every MCP token this person made for that workspace. */
@Component({
  selector: "li[ksWorkspaceCard]",
  host: { class: "workspaces-card", "[class.workspaces-card-active]": "isActive()" },
  imports: [Button, CheckMark, RouterLink],
  templateUrl: "./workspace-card.html",
})
export class WorkspaceCard {
  readonly workspace = input.required<Workspace>();
  readonly isActive = input.required<boolean>();
  readonly isBusy = input.required<boolean>();
  readonly armedId = input.required<string | null>();
  readonly arm = output<string | null>();
  readonly open = output();
  readonly isCopied = input.required<boolean>();
  readonly copyCode = output();
  readonly leave = output();
}
