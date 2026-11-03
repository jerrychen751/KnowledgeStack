import { Component, type OnInit, signal } from "@angular/core";

import type {
  CreateMcpTokenRequest,
  CreateMcpTokenResponse,
  ListMcpTokensResponse,
  McpToken,
} from "@knowledgestack/api-contract/mcp-tokens";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Label } from "@/components/label";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { PageRequest } from "@/lib/page-request";

import { McpTokenCard } from "./mcp-token-card";
import { NewTokenPanel } from "./new-token-panel";

/** The page that mints and revokes the tokens an MCP client sends. A minted token reaches the browser once, so `newToken` holds it in state until the person dismisses the panel or reloads. */
@Component({
  selector: "ks-mcp-tokens-page",
  host: { style: "display: contents" },
  imports: [Button, EmptyState, Label, McpTokenCard, NewTokenPanel, PageLayout, Section],
  templateUrl: "./mcp-tokens-page.html",
})
export class McpTokensPage implements OnInit {
  protected readonly mcpTokens = signal<McpToken[]>([]);
  protected readonly newToken = signal<CreateMcpTokenResponse | null>(null);
  protected readonly name = signal("");
  protected readonly armedId = signal<string | null>(null);
  protected readonly request = new PageRequest();

  private async loadMcpTokens(): Promise<void> {
    const body = await requestJson<ListMcpTokensResponse>("/api/mcp-tokens");
    this.mcpTokens.set(body.mcpTokens);
  }

  ngOnInit(): void {
    this.loadMcpTokens().catch((error: unknown) =>
      this.request.reportFailure(error, "The tokens did not load."),
    );
  }

  protected createMcpToken(): Promise<boolean> {
    return this.request.runRequest("Creating the token", async () => {
      const created = await requestJson<CreateMcpTokenResponse>("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.name() } satisfies CreateMcpTokenRequest),
      });
      this.newToken.set(created);
      this.name.set("");
      await this.loadMcpTokens();
    });
  }

  protected deleteMcpToken(mcpTokenId: string, tokenName: string): Promise<boolean> {
    return this.request.runRequest(
      "Revoking the token",
      async () => {
        await sendJson(`/api/mcp-tokens/${mcpTokenId}`, "DELETE");
        this.armedId.set(null);
        await this.loadMcpTokens();
      },
      `${tokenName} is revoked. Any client still using it now gets a 401 error.`,
    );
  }
}
