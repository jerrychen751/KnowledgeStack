"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/button";
import { CheckMark } from "@/components/check-mark";
import { Label } from "@/components/label";

import styles from "./mcp-tokens.module.css";

/**
 * The command that registers this server, shown once after a token is minted.
 *
 * Each client registers a remote server its own way, so the panel holds one tab for each and prints the
 * command with the secret already inside it. Codex reads the secret from an environment variable and stores
 * only the variable name, so its tab prints two lines. The URL and the header stay under the tabs, because a
 * person whose client is missing still needs both.
 */
export function NewTokenPanel({
  name,
  secret,
  serverUrl,
  onDismiss,
}: {
  name: string;
  secret: string;
  serverUrl: string;
  onDismiss: () => void;
}): ReactNode {
  const tabs = [
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

  const [openTab, setOpenTab] = useState<(typeof tabs)[number]["key"]>("claude-code");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copiedTimer = useRef<number | undefined>(undefined);
  const command = tabs.find((tab) => tab.key === openTab)?.command ?? "";

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <Label as="p">{name} is ready</Label>
          <p className={styles.panelWarning}>
            Run the command for your client. A reload never shows this token again.
          </p>
        </div>
        <Button onClick={onDismiss}>Done</Button>
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${tab.key === openTab ? styles.tabOpen : ""}`}
            onClick={() => {
              setOpenTab(tab.key);
              setCopyState("idle");
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <pre className={styles.command}>{command}</pre>

      <div className={styles.panelFoot}>
        <Button variant="primary" className={styles.copyButton} onClick={() => void copyCommand()}>
          {copyState === "copied" ? (
            <>
              <CheckMark />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </Button>
        {copyState === "failed" ? (
          <span className={styles.copyNotice}>Copy the command by hand.</span>
        ) : null}
      </div>

      <dl className={styles.rawFields}>
        <dt>Server URL</dt>
        <dd>{serverUrl}</dd>
        <dt>Header</dt>
        <dd>Authorization: Bearer {secret}</dd>
      </dl>
    </section>
  );
}
