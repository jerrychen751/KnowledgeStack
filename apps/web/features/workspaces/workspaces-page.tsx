"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type {
  CreateWorkspaceRequest,
  JoinWorkspaceRequest,
  ListWorkspacesResponse,
  Workspace,
} from "@knowledgestack/api-contract/workspaces";

import { Button } from "@/components/button";
import { Label } from "@/components/label";
import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { usePageRequest } from "@/lib/use-page-request";
import { workspaceChangedEvent } from "@/lib/workspace-changed-event";

import { WorkspaceCard } from "./workspace-card";
import styles from "./workspaces.module.css";

export function WorkspacesPage(): ReactNode {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [armedId, setArmedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const { notice, setNotice, busyMessage, isBusy, reportFailure, runRequest } = usePageRequest();

  const loadWorkspaces = useCallback(async () => {
    const body = await requestJson<ListWorkspacesResponse>("/api/workspaces");
    setWorkspaces(body.workspaces);
    setActiveWorkspaceId(body.activeWorkspaceId);
  }, []);

  useEffect(() => {
    loadWorkspaces().catch((error: unknown) =>
      reportFailure(error, "The workspaces did not load."),
    );
  }, [loadWorkspaces, reportFailure]);

  const write = useCallback(
    (busyText: string, send: () => Promise<unknown>, successText: string) =>
      runRequest(
        busyText,
        async () => {
          await send();
          await loadWorkspaces();
          window.dispatchEvent(new Event(workspaceChangedEvent));
        },
        successText,
      ),
    [loadWorkspaces, runRequest],
  );

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copyJoinCode = useCallback(
    async (workspaceId: string, code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        setNotice(null);
        setCopiedId(workspaceId);
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopiedId(null), 2000);
      } catch {
        setNotice({ text: `Copy the code by hand: ${code}`, failed: true });
      }
    },
    [setNotice],
  );

  return (
    <PageLayout
      title="Workspaces"
      subtitle="A workspace holds its own sources, documents and chunks. A question reads the open workspace and no other."
      notice={notice}
    >
      <Section
        label="Your workspaces"
        aside={isBusy ? <p className={styles.busy}>{busyMessage}</p> : null}
      >
        {workspaces.length === 0 ? (
          <EmptyState>You have no workspaces yet.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                isActive={workspace.id === activeWorkspaceId}
                isBusy={isBusy}
                armedId={armedId}
                onArm={setArmedId}
                onOpen={() =>
                  void write(
                    "Opening the workspace",
                    () => sendJson(`/api/workspaces/${workspace.id}/select`, "POST"),
                    `${workspace.name} is open.`,
                  )
                }
                isCopied={workspace.id === copiedId}
                onCopyCode={() => void copyJoinCode(workspace.id, workspace.joinCode)}
                onLeave={() =>
                  void write(
                    "Leaving the workspace",
                    () => sendJson(`/api/workspaces/${workspace.id}/membership`, "DELETE"),
                    `You left ${workspace.name}. Every MCP token you made for it is revoked.`,
                  ).then(() => setArmedId(null))
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <section className={styles.forms}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void write(
              "Creating the workspace",
              () =>
                sendJson("/api/workspaces", "POST", {
                  name: workspaceName,
                } satisfies CreateWorkspaceRequest),
              `${workspaceName} is open. Share its join code to add a member.`,
            ).then((created) => {
              if (created) {
                setWorkspaceName("");
              }
            });
          }}
        >
          <Label as="p">Create a workspace</Label>
          <div className={styles.formRow}>
            <input
              className={styles.input}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Platform team"
              maxLength={60}
              aria-label="Workspace name"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={isBusy || workspaceName.trim() === ""}
            >
              Create
            </Button>
          </div>
        </form>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void write(
              "Joining the workspace",
              () =>
                sendJson("/api/workspaces/join", "POST", {
                  code: joinCode,
                } satisfies JoinWorkspaceRequest),
              "You joined the workspace, and it is open.",
            ).then((joined) => {
              if (joined) {
                setJoinCode("");
              }
            });
          }}
        >
          <Label as="p">Join a workspace</Label>
          <div className={styles.formRow}>
            <input
              className={`${styles.input} ${styles.codeInput}`}
              value={joinCode}
              onChange={(event) =>
                setJoinCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-HJ-KM-NP-Z2-9]/g, "")
                    .slice(0, 8),
                )
              }
              placeholder="K7QW2M4D"
              pattern="[A-HJ-KM-NP-Z2-9]{8}"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              title="Enter all eight join-code letters or digits."
              aria-label="Join code"
            />
            <Button type="submit" disabled={isBusy || joinCode.length !== 8}>
              Join
            </Button>
          </div>
        </form>
      </section>
    </PageLayout>
  );
}
