import { Component, computed, input, type OnDestroy, output, signal } from "@angular/core";

import { Button } from "@/components/button";
import { CheckMark } from "@/components/check-mark";
import { Label } from "@/components/label";

/**
 * The command that registers this server, shown once after a token is minted.
 *
 * Each client registers a remote server its own way, so the panel holds one tab for each and prints the
 * command with the secret already inside it. Codex reads the secret from an environment variable and stores
 * only the variable name, so its tab prints two lines. The URL and the header stay under the tabs, because a
 * person whose client is missing still needs both.
 */
@Component({
  selector: "section[ksNewTokenPanel]",
  host: { class: "mcp-tokens-panel" },
  imports: [Button, CheckMark, Label],
  templateUrl: "./new-token-panel.html",
})
export class NewTokenPanel implements OnDestroy {
  readonly secret = input.required<string>();
  readonly serverUrl = input.required<string>();
  readonly dismiss = output();

  protected readonly tabs = computed(() => {
    const secret = this.secret();
    const serverUrl = this.serverUrl();
    return [
      {
        key: "claude-code",
        label: "Claude Code",
        command: [
          "claude mcp add \\",
          "  --transport http \\",
          "  --scope user \\",
          "  knowledgestack \\",
          `  ${serverUrl} \\`,
          `  --header "Authorization: Bearer ${secret}"`,
        ].join("\n"),
      },
      {
        key: "codex",
        label: "Codex",
        command: [
          `export KNOWLEDGESTACK_MCP_TOKEN="${secret}"`,
          "",
          "codex mcp add knowledgestack \\",
          `  --url ${serverUrl} \\`,
          "  --bearer-token-env-var KNOWLEDGESTACK_MCP_TOKEN",
        ].join("\n"),
      },
      {
        key: "other",
        label: "Other clients",
        command: JSON.stringify(
          {
            mcpServers: {
              knowledgestack: {
                type: "http",
                url: serverUrl,
                headers: { Authorization: `Bearer ${secret}` },
              },
            },
          },
          null,
          2,
        ),
      },
    ] as const;
  });

  protected readonly openTab = signal<"claude-code" | "codex" | "other">("claude-code");
  protected readonly copyState = signal<"idle" | "copied" | "failed">("idle");
  private copiedTimer: number | undefined = undefined;
  protected readonly command = computed(() => this.tabs().find((tab) => tab.key === this.openTab())?.command ?? "");

  ngOnDestroy(): void {
    window.clearTimeout(this.copiedTimer);
  }

  protected async copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.command());
      this.copyState.set("copied");
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = window.setTimeout(() => this.copyState.set("idle"), 2000);
    } catch {
      this.copyState.set("failed");
    }
  }
}
