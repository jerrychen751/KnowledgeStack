"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

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
import { usePageRequest } from "@/lib/use-page-request";

import { McpTokenCard } from "./mcp-token-card";
import { NewTokenPanel } from "./new-token-panel";
import styles from "./mcp-tokens.module.css";

/** The page that mints and revokes the tokens an MCP client sends. A minted token reaches the browser once, so `newToken` holds it in state until the person dismisses the panel or reloads. */
export function McpTokensPage(): ReactNode {
  const [mcpTokens, setMcpTokens] = useState<McpToken[]>([]);
  const [newToken, setNewToken] = useState<CreateMcpTokenResponse | null>(null);
  const [name, setName] = useState("");
  const [armedId, setArmedId] = useState<string | null>(null);
  const { notice, busyMessage, isBusy, reportFailure, runRequest } = usePageRequest();

  const loadMcpTokens = useCallback(async () => {
    const body = await requestJson<ListMcpTokensResponse>("/api/mcp-tokens");
    setMcpTokens(body.mcpTokens);
  }, []);

  useEffect(() => {
    loadMcpTokens().catch((error: unknown) =>
      reportFailure(error, "The tokens did not load."),
    );
  }, [loadMcpTokens, reportFailure]);

  const createMcpToken = () =>
    runRequest("Creating the token", async () => {
      const created = await requestJson<CreateMcpTokenResponse>("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name } satisfies CreateMcpTokenRequest),
      });
      setNewToken(created);
      setName("");
      await loadMcpTokens();
    });

  const deleteMcpToken = (mcpTokenId: string, tokenName: string) =>
    runRequest(
      "Revoking the token",
      async () => {
        await sendJson(`/api/mcp-tokens/${mcpTokenId}`, "DELETE");
        setArmedId(null);
        await loadMcpTokens();
      },
      `${tokenName} is revoked. Any client that holds it now gets 401.`,
    );

  return (
    <PageLayout
      title="MCP Tokens"
      subtitle="A token lets an outside agent, such as Claude Code, call the tools of this workspace. It reads the open workspace and no other."
      notice={notice}
    >
      {newToken === null ? null : (
        <NewTokenPanel
          name={newToken.mcpToken.name}
          secret={newToken.secret}
          serverUrl={newToken.serverUrl}
          onDismiss={() => setNewToken(null)}
        />
      )}

      <Section label="Create a token">
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void createMcpToken();
          }}
        >
          <Label as="p">Name the MCP Token</Label>
          <div className={styles.formRow}>
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Claude Code on the laptop"
              maxLength={60}
              aria-label="Token name"
            />
            <Button type="submit" variant="primary" disabled={isBusy || name.trim() === ""}>
              Create
            </Button>
          </div>
        </form>
      </Section>

      <Section
        label="Your tokens"
        aside={isBusy ? <p className={styles.busy}>{busyMessage}</p> : null}
      >
        {mcpTokens.length === 0 ? (
          <EmptyState>This workspace has no MCP token yet.</EmptyState>
        ) : (
          mcpTokens.map((mcpToken) => (
            <McpTokenCard
              key={mcpToken.id}
              mcpToken={mcpToken}
              isBusy={isBusy}
              armedId={armedId}
              onArm={setArmedId}
              onDelete={() => void deleteMcpToken(mcpToken.id, mcpToken.name)}
            />
          ))
        )}
      </Section>
    </PageLayout>
  );
}
