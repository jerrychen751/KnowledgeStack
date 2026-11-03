import { Component, computed, input, output } from "@angular/core";

import type { McpToken } from "@knowledgestack/api-contract/mcp-tokens";

import { Button } from "@/components/button";
import { formatTime } from "@/lib/format-time";

/** One token: what the person called it, when a client last used it, when it expires, and Revoke. `armedId` names the token whose next click revokes it, and is null when nothing is armed. Revocation takes two clicks, because the client stops answering at once and the secret cannot come back. */
@Component({
  selector: "article[ksMcpTokenCard]",
  host: { class: "mcp-tokens-card" },
  imports: [Button],
  template: `
    <div class="mcp-tokens-card-head">
      <div>
        <h2 class="mcp-tokens-card-name">{{ mcpToken().name }}</h2>
        <p class="mcp-tokens-card-stats">
          <span>last used {{ lastUsed() }}</span>
          <span [class.mcp-tokens-expired]="hasExpired()">{{ hasExpired() ? "expired" : "expires " + expiresAt().toLocaleDateString() }}</span>
        </p>
      </div>
      <div class="mcp-tokens-card-actions">
        @if (armedId() === mcpToken().id) {
          <button ksButton [disabled]="isBusy()" (click)="delete.emit()">Revoke token</button>
          <button ksButton [disabled]="isBusy()" (click)="arm.emit(null)">Cancel</button>
        } @else {
          <button ksButton [disabled]="isBusy()" (click)="arm.emit(mcpToken().id)">Revoke</button>
        }
      </div>
    </div>
  `,
})
export class McpTokenCard {
  readonly mcpToken = input.required<McpToken>();
  readonly isBusy = input.required<boolean>();
  readonly armedId = input.required<string | null>();
  readonly arm = output<string | null>();
  readonly delete = output();
  protected readonly lastUsed = computed(() => formatTime(this.mcpToken().lastUsedAt));
  // formatTime measures how long ago a timestamp was, so an expiry in the future reads "just now" through it.
  protected readonly expiresAt = computed(() => new Date(this.mcpToken().expiresAt));
  protected readonly hasExpired = computed(() => this.expiresAt().getTime() <= Date.now());
}
