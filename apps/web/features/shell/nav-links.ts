import { Component, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";

import { CurrentPath } from "@/lib/current-path";

@Component({
  selector: "ks-nav-links",
  host: { style: "display: contents" },
  imports: [RouterLink],
  template: `
    <!-- Every page behind these links needs a session, so the sign-in page shows none of them. -->
    @if (currentPath.path() !== "/signin") {
      <nav class="shell-nav">
        @for (page of pages(); track page.href) {
          <a
            [routerLink]="page.href"
            class="shell-nav-link"
            [class.shell-nav-link-active]="isActive(page.href)"
            [attr.aria-current]="isActive(page.href) ? 'page' : null"
          >
            {{ page.label }}
          </a>
        }
      </nav>
    }
  `,
})
export class NavLinks {
  readonly pages = input.required<{ href: string; label: string }[]>();
  protected readonly currentPath = inject(CurrentPath);

  protected isActive(href: string): boolean {
    const pathname = this.currentPath.path();
    // Settings holds nested pages, so a link stays current while the browser reads any page under it.
    return href === "/"
      ? pathname === "/" || pathname.startsWith("/ask/")
      : pathname === href || pathname.startsWith(`${href}/`);
  }
}
