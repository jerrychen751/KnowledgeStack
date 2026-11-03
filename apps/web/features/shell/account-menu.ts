import { Component, inject } from "@angular/core";

import { sendJson } from "@/lib/api-client";

import { AccountContext } from "./account-context";

@Component({
  selector: "ks-account-menu",
  host: { style: "display: contents" },
  template: `
    @if (accountContext.account(); as account) {
      <div class="shell-account">
        <span class="shell-identity">
          @if (account.user.externalImageUrl !== null) {
            <img class="shell-avatar" [src]="account.user.externalImageUrl" alt="" width="22" height="22" />
          }
          <span class="shell-email">{{ account.user.externalEmail }}</span>
        </span>
        <button type="button" class="shell-sign-out" (click)="signOut()">Sign out</button>
      </div>
    }
  `,
})
export class AccountMenu {
  protected readonly accountContext = inject(AccountContext);

  protected async signOut(): Promise<void> {
    await sendJson("/api/auth/signout", "POST").catch(() => undefined);
    window.location.assign("/signin");
  }
}
