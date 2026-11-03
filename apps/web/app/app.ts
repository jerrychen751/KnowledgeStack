import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";

import { AccountMenu } from "@/features/shell/account-menu";
import { NavLinks } from "@/features/shell/nav-links";
import { WorkspaceChip } from "@/features/shell/workspace-chip";

@Component({
  selector: "ks-root",
  host: { style: "display: contents" },
  imports: [AccountMenu, NavLinks, RouterLink, RouterOutlet, WorkspaceChip],
  template: `
    <div class="shell-shell">
      <header class="shell-header">
        <a routerLink="/" class="shell-wordmark">
          <svg class="shell-mark" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="none">
            <rect y="0" width="14" height="2" fill="currentColor" />
            <rect y="5" width="10" height="2" fill="currentColor" />
            <rect y="10" width="6" height="2" fill="var(--signal)" />
          </svg>
          <span class="shell-wordmark-text">KnowledgeStack</span>
        </a>
        <ks-workspace-chip />
        <ks-nav-links [pages]="pages" />
        <ks-account-menu />
      </header>
      <main class="shell-main"><router-outlet /></main>
    </div>
  `,
})
export class App {
  protected readonly pages = [
    { href: "/", label: "Ask" },
    { href: "/sources", label: "Sources" },
    { href: "/databases", label: "Databases" },
    { href: "/settings", label: "Settings" },
  ];
}
