"use client"; // Next.js renders components on server first and sends only HTML by default
// This line marks the file as a client component so browser also downloads the JS

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { ErrorResponse } from "@knowledgestack/shared/http";
import type {
  ListDocumentsResponse,
  ListSourcesResponse,
  ReadConnectorStatusResponse,
  SaveUploadsRequest,
  Source,
  SourceDocument,
  SourceProvider,
  StartAuthorizationResponse,
} from "@knowledgestack/shared/sources";

import styles from "./sources.module.css";

/** Convert an ISO 8601 timestamp from the sources API to compact display text. The value must have a form such as "2026-08-20T16:42:03.000Z". A null value means no sync or index pass has finished. Return a string with one of these forms: "never", "just now", "<minutes> min ago", "<hours> h ago", or a browser-local date. */
function formatTime(value: string | null): string {
  if (value === null) {
    return "never";
  }

  const stamp = new Date(value);
  const minutes = Math.round((Date.now() - stamp.getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)} h ago`;
  }

  return stamp.toLocaleDateString();
}

export default function SourcesPage(): ReactNode {
  // const [state, stateSetter] = useState<T>(initialValue);
  const [sources, setSources] = useState<Source[]>([]);
  const [documentsBySourceId, setDocumentsBySourceId] = useState<Record<string, SourceDocument[]>>({});
  const [connectors, setConnectors] = useState<ReadConnectorStatusResponse | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [removalAwaitingConfirmId, setRemovalAwaitingConfirmId] = useState<string | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    // Absolute URL contains protocol (http/https) and host; relative URL may either start from root of site ('/' prefix)
    // or from relative directory (no '/' prefix)
    const response = await fetch("/api/sources");
    // 403 means the session opened no workspace, and /workspaces is where the person picks one.
    if (response.status === 403) {
      // Redirect to workspace authentication page
      window.location.assign("/workspaces");
      return;
    }

    const body = (await response.json()) as ListSourcesResponse;
    setSources(body.sources);

    const documents = await Promise.all(
      body.sources.map(async (source) => {
        const documentResponse = await fetch(`/api/sources/${source.id}/documents`);
        const documentBody = (await documentResponse.json()) as ListDocumentsResponse;
        return [source.id, documentBody.documents] as const;
      }),
    );
    setDocumentsBySourceId(Object.fromEntries(documents));
  }, []);

  useEffect(() => {
    void loadSources();
    fetch("/api/sources/connectors")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ReadConnectorStatusResponse | null) => setConnectors(body))
      .catch(() => setConnectors(null));

    const parameters = new URLSearchParams(window.location.search);
    const failure = parameters.get("error");
    if (failure !== null) {
      setNotice({ text: failure, failed: true });
    } else if (parameters.get("connected") !== null) {
      setNotice({ text: "The source is connected. Sync it to make it searchable.", failed: false });
    }
  }, [loadSources]);

  const runRequest = useCallback(
    async (message: string, request: () => Promise<Response>) => {
      setBusyMessage(message);
      setNotice(null);
      try {
        const response = await request();
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as Partial<ErrorResponse>;
          throw new Error(body.message ?? `The API answered ${response.status}.`);
        }
        await loadSources();
      } catch (error) {
        setNotice({
          text: error instanceof Error ? error.message : "The request failed.",
          failed: true,
        });
      } finally {
        setBusyMessage("");
        setRemovalAwaitingConfirmId(null);
      }
    },
    [loadSources],
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) {
        return;
      }

      const payload = await Promise.all(
        files.map(async (file) => ({ name: file.name, text: await file.text() })),
      );
      await runRequest(
        `Syncing ${files.length} ${files.length === 1 ? "file" : "files"}`,
        () =>
          fetch("/api/sources/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: payload } satisfies SaveUploadsRequest),
          }),
      );
    },
    [runRequest],
  );

  const connectProvider = useCallback(async (provider: SourceProvider) => {
    const response = await fetch(`/api/sources/connect/${provider}`);
    const body = (await response.json()) as Partial<StartAuthorizationResponse & ErrorResponse>;
    if (body.authorizeUrl === undefined) {
      setNotice({ text: body.message ?? "The provider is not configured.", failed: true });
      return;
    }

    window.location.href = body.authorizeUrl;
  }, []);

  const isBusy = busyMessage !== "";

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Sources</h1>
          <p className={styles.subtitle}>
            Answers use only the sources on this page.
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
          <span className="label">Add files</span>
        </div>
        <div
          className={`${styles.dropZone} ${isDragOver ? styles.dropZoneOver : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            void uploadFiles(event.dataTransfer.files);
          }}
        >
          <div className={styles.dropCopy}>
            <p className={styles.dropTitle}>Drop files here.</p>
            <p className={styles.dropNote}>
              {connectors === null
                ? "Text documents only."
                : `Text documents only: ${connectors.uploads.fileExtensions.join(", ")}.`}
            </p>
          </div>
          <button
            type="button"
            className="button button--primary"
            disabled={isBusy}
            onClick={() => filePickerRef.current?.click()}
          >
            {isBusy ? busyMessage : "Choose files"}
          </button>
          <input
            ref={filePickerRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            accept={connectors?.uploads.fileExtensions.join(",")}
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">Your sources</span>
        </div>
        {sources.length === 0 ? (
          <p className={styles.empty}>No sources yet.</p>
        ) : (
          sources.map((source) => (
            <article key={source.id} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <span className="label">{source.provider}</span>
                  <h2 className={styles.cardName}>{source.externalDisplayName}</h2>
                  <p className={styles.cardStats}>
                    <span className={styles.cardStat}>
                      <b>{source.documentCount}</b>{" "}
                      {source.documentCount === 1 ? "document" : "documents"}
                    </span>
                    <span className={styles.cardStat}>
                      <b>{source.chunkCount}</b>{" "}
                      {source.chunkCount === 1 ? "chunk" : "chunks"}
                    </span>
                    <span className={styles.cardStat}>synced {formatTime(source.lastSyncedAt)}</span>
                  </p>
                </div>
                <div className={styles.cardActions}>
                  {removalAwaitingConfirmId === source.id ? (
                    <>
                      <p className={styles.confirm}>
                        {source.provider === "filesystem"
                          ? "Delete this source and every file uploaded to it?"
                          : `Remove this source? Your pages stay in ${source.provider}.`}
                      </p>
                      <button
                        type="button"
                        className={`button ${styles.confirmButton}`}
                        disabled={isBusy}
                        onClick={() =>
                          void runRequest("Removing", () =>
                            fetch(`/api/sources/${source.id}`, { method: "DELETE" }),
                          )
                        }
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={isBusy}
                        onClick={() => setRemovalAwaitingConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runRequest("Syncing", () =>
                            fetch(`/api/sources/${source.id}/sync`, { method: "POST" }),
                          )
                        }
                      >
                        Sync
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={isBusy}
                        onClick={() => setRemovalAwaitingConfirmId(source.id)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
              {(documentsBySourceId[source.id] ?? []).length === 0 ? null : (
                <div
                  className={`${styles.documents} ${
                    source.provider === "filesystem" ? styles.documentsRemovable : ""
                  }`}
                >
                  {(documentsBySourceId[source.id] ?? []).map((document) => (
                    <div key={document.id} className={styles.documentRow}>
                      <span className={styles.documentName}>{document.externalTitle}</span>
                      <span
                        className={`${styles.documentMeta} ${
                          document._count.chunks === 0 ? styles.documentSkipped : ""
                        }`}
                      >
                        {document.documentType === "attachment"
                          ? "not text"
                          : `${document._count.chunks} ${document._count.chunks === 1 ? "chunk" : "chunks"}`}
                      </span>
                      <span className={`${styles.documentMeta} ${styles.documentTime}`}>
                        {formatTime(document.lastIndexedAt)}
                      </span>
                      {source.provider === "filesystem" ? (
                        <button
                          type="button"
                          className={`${styles.documentRemove} ${
                            removalAwaitingConfirmId === document.id ? styles.documentRemoveArmed : ""
                          }`}
                          disabled={isBusy}
                          aria-label={
                            removalAwaitingConfirmId === document.id
                              ? `Delete ${document.externalTitle}`
                              : `Remove ${document.externalTitle}`
                          }
                          onClick={() => {
                            if (removalAwaitingConfirmId !== document.id) {
                              setRemovalAwaitingConfirmId(document.id);
                              return;
                            }

                            void runRequest("Deleting", () =>
                              fetch(`/api/sources/${source.id}/documents/${document.id}`, {
                                method: "DELETE",
                              }),
                            );
                          }}
                        >
                          {removalAwaitingConfirmId === document.id ? "Delete" : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">Connect a provider</span>
        </div>
        <div className={styles.connectors}>
          {(connectors?.providers ?? []).map((provider) => (
            <article key={provider.provider} className={styles.connector}>
              <h2 className={styles.connectorName}>{provider.provider}</h2>
              {provider.connectable ? (
                <p className={styles.connectorDetail}>
                  Grant access to the pages you want KnowledgeStack to read.
                </p>
              ) : null}
              <div className={styles.connectorAction}>
                <button
                  type="button"
                  className="button"
                  disabled={!provider.connectable || isBusy}
                  aria-label={`Connect ${provider.provider}`}
                  onClick={() => void connectProvider(provider.provider)}
                >
                  Connect
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
