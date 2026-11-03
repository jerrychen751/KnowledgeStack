import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";

import { Label } from "@/components/label";
import { CurrentPath } from "@/lib/current-path";

/** The left column of every settings page: one heading for each group, and the pages of that group under it. */
@Component({
  selector: "nav[ksSettingsNav]",
  host: { class: "settings-nav" },
  imports: [Label, RouterLink],
  template: `
    <h2 class="settings-nav-title">Settings</h2>
    @for (group of groups; track group.label) {
      <div class="settings-group">
        <p ksLabel>{{ group.label }}</p>
        <ul class="settings-group-pages">
          @for (page of group.pages; track page.href) {
            <li>
              <a
                [routerLink]="page.href"
                class="settings-nav-link"
                [class.settings-nav-link-active]="currentPath.path() === page.href"
                [attr.aria-current]="currentPath.path() === page.href ? 'page' : null"
              >
                {{ page.label }}
              </a>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class SettingsNav {
  protected readonly currentPath = inject(CurrentPath);
  protected readonly groups = [
    {
      label: "Developer",
      pages: [{ href: "/settings/mcp-tokens", label: "MCP Tokens" }],
    },
  ];
}
