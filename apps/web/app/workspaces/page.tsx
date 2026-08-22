"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { ErrorResponse } from "@knowledgestack/shared/http";
import type {
  CreateWorkspaceRequest,
  JoinWorkspaceRequest,
  ListWorkspacesResponse,
  Workspace,
} from "@knowledgestack/shared/workspaces";

import { workspaceChangedEvent } from "../account-menu";

import styles from "./workspaces.module.css";

export default function WorkspacesPage(): ReactNode {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [busyMessage, setBusyMessage] = useState("");

  const loadWorkspaces = useCallback(async () => {
    const response = await fetch("/api/workspaces");
    if (response.status === 401) {
      window.location.assign("/signin");
      return;
    }

    const body = (await response.json()) as ListWorkspacesResponse;
    setWorkspaces(body.workspaces);
    setActiveWorkspaceId(body.activeWorkspaceId);
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const submit = useCallback(
    async (
      message: string,
      path: string,
      payload: CreateWorkspaceRequest | JoinWorkspaceRequest | null,
      successMessage: string,
    ) => {
      setBusyMessage(message);
      setNotice(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload === null ? undefined : JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as Partial<ErrorResponse>;
          throw new Error(body.message ?? `The API answered ${response.status}.`);
        }
        await loadWorkspaces();
        window.dispatchEvent(new Event(workspaceChangedEvent));
        setNotice({ text: successMessage, failed: false });
      } catch (error) {
        setNotice({
          text: error instanceof Error ? error.message : "The request failed.",
          failed: true,
        });
      } finally {
        setBusyMessage("");
      }
    },
    [loadWorkspaces],
  );

  const isBusy = busyMessage !== "";

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Workspaces</h1>
          <p className={styles.subtitle}>
            A workspace holds its own sources, documents and chunks. A question reads the open workspace
            and no other.
          </p>
        </div>
      </header>

      {notice === null ? null : (
        <p className={`${styles.notice} ${notice.failed ? styles.noticeFailure : ""}`}>
          {notice.text}
        </p>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className="label">Your workspaces</p>
          {isBusy ? <p className={styles.busy}>{busyMessage}</p> : null}
        </div>

        {workspaces.length === 0 ? (
          <p className={styles.empty}>You have no workspaces yet.</p>
        ) : (
          <ul className={styles.list}>
            {workspaces.map((workspace) => (
              <li
                key={workspace.id}
                className={`${styles.card} ${workspace.id === activeWorkspaceId ? styles.cardActive : ""}`}
              >
                <div className={styles.cardHead}>
                  <div className={styles.cardIdentity}>
                    <h2 className={styles.cardName}>{workspace.name}</h2>
                    <p className={styles.cardStats}>
                      <span>
                        {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}
                      </span>
                      <span>
                        {workspace.sourceCount} {workspace.sourceCount === 1 ? "source" : "sources"}
                      </span>
                    </p>
                  </div>
                  {workspace.id === activeWorkspaceId ? (
                    <span className={styles.openBadge}>Open</span>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      disabled={isBusy}
                      onClick={() =>
                        submit(
                          "Opening the workspace",
                          `/api/workspaces/${workspace.id}/select`,
                          null,
                          `${workspace.name} is open.`,
                        )
                      }
                    >
                      Open
                    </button>
                  )}
                </div>

                <div className={styles.cardFoot}>
                  <p className={styles.codeLabel}>Join code</p>
                  <code className={styles.code}>{workspace.joinCode}</code>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(workspace.joinCode);
                        setNotice({
                          text: `The code ${workspace.joinCode} is on the clipboard.`,
                          failed: false,
                        });
                      } catch {
                        setNotice({
                          text: `Copy the code by hand: ${workspace.joinCode}`,
                          failed: true,
                        });
                      }
                    }}
                  >
                    Copy
                  </button>
                  {workspace.id === activeWorkspaceId ? (
                    <span className={styles.cardLinks}>
                      <Link href="/">Ask a question</Link>
                      <Link href="/sources">Add sources</Link>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.forms}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                "Creating the workspace",
                "/api/workspaces",
                { name: workspaceName },
                `${workspaceName} is open. Share its join code to add a member.`,
              ).then(() => setWorkspaceName(""));
            }}
          >
            <p className="label">Create a workspace</p>
            <div className={styles.formRow}>
              <input
                className={styles.input}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Platform team"
                maxLength={60}
                aria-label="Workspace name"
              />
              <button
                type="submit"
                className="button button--primary"
                disabled={isBusy || workspaceName.trim() === ""}
              >
                Create
              </button>
            </div>
          </form>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                "Joining the workspace",
                "/api/workspaces/join",
                { code: joinCode },
                "You joined the workspace, and it is open.",
              ).then(() => setJoinCode(""));
            }}
          >
            <p className="label">Join a workspace</p>
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
              <button
                type="submit"
                className="button"
                disabled={isBusy || joinCode.length !== 8}
              >
                Join
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
