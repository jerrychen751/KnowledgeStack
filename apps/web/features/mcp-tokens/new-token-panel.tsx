"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/button";
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
  const [copyNotice, setCopyNotice] = useState("");
  const command = tabs.find((tab) => tab.key === openTab)?.command ?? "";

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyNotice("The command is on the clipboard.");
    } catch {
      setCopyNotice("Copy the command by hand.");
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
              setCopyNotice("");
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <pre className={styles.command}>{command}</pre>

      <div className={styles.panelFoot}>
        <Button variant="primary" onClick={() => void copyCommand()}>
          Copy
        </Button>
        {copyNotice === "" ? null : <span className={styles.copyNotice}>{copyNotice}</span>}
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
