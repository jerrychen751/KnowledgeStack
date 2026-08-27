"use client"; // Next.js renders components on server first and sends only HTML by default
// This line marks the file as a client component so browser also downloads the JS

import { useCallback, useEffect, useState, type ReactNode } from "react";

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

import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { usePageRequest } from "@/lib/use-page-request";

import { ConnectorList } from "./connector-list";
import { SourceCard } from "./source-card";
import { UploadDropZone } from "./upload-drop-zone";

export function SourcesPage(): ReactNode {
  // const [state, stateSetter] = useState<T>(initialValue);
  const [sources, setSources] = useState<Source[]>([]);
  const [documentsBySourceId, setDocumentsBySourceId] = useState<Record<string, SourceDocument[]>>(
    {},
  );
  const [connectors, setConnectors] = useState<ReadConnectorStatusResponse | null>(null);
  const [removalAwaitingConfirmId, setRemovalAwaitingConfirmId] = useState<string | null>(null);
  const { notice, setNotice, busyMessage, isBusy, reportFailure, runRequest } = usePageRequest();

  const loadSources = useCallback(async () => {
    // Absolute URL contains protocol (http/https) and host; relative URL may either start from root of site ('/' prefix)
    // or from relative directory (no '/' prefix)
    const body = await requestJson<ListSourcesResponse>("/api/sources");
    setSources(body.sources);

    const documents = await Promise.all(
      body.sources.map(async (source) => {
        const documentBody = await requestJson<ListDocumentsResponse>(
          `/api/sources/${source.id}/documents`,
        ).catch(() => ({ documents: [] }));
        return [source.id, documentBody.documents] as const;
      }),
    );
    setDocumentsBySourceId(Object.fromEntries(documents));
  }, []);

  const write = useCallback(
    (busyText: string, send: () => Promise<unknown>) =>
      runRequest(busyText, async () => {
        await send();
        await loadSources();
      }).finally(() => setRemovalAwaitingConfirmId(null)),
    [loadSources, runRequest],
  );

  useEffect(() => {
    requestJson<ReadConnectorStatusResponse>("/api/sources/connectors")
      .then(setConnectors)
      .catch(() => setConnectors(null));

    loadSources().catch((error: unknown) => reportFailure(error, "The sources did not load."));

    const parameters = new URLSearchParams(window.location.search);
    const failure = parameters.get("error");
    if (failure !== null) {
      setNotice({ text: failure, failed: true });
    } else if (parameters.get("connected") !== null) {
      setNotice({ text: "The source is connected. Sync it to make it searchable.", failed: false });
    }
  }, [loadSources, reportFailure, setNotice]);

  const uploadFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) {
        return;
      }

      const payload = await Promise.all(
        files.map(async (file) => ({ name: file.name, text: await file.text() })),
      );
      await write(`Syncing ${files.length} ${files.length === 1 ? "file" : "files"}`, () =>
        sendJson("/api/sources/uploads", "POST", { files: payload } satisfies SaveUploadsRequest),
      );
    },
    [write],
  );

  const connectProvider = useCallback(
    async (provider: SourceProvider) => {
      try {
        const body = await requestJson<StartAuthorizationResponse>(
          `/api/sources/connect/${provider}`,
        );
        window.location.href = body.authorizeUrl;
      } catch (error) {
        reportFailure(error, `The API returned no ${provider} authorization URL.`);
      }
    },
    [reportFailure],
  );

  return (
    <PageLayout
      title="Sources"
      subtitle="Answers use only the sources on this page."
      notice={notice}
    >
      <Section label="Add files">
        <UploadDropZone
          fileExtensions={connectors?.uploads.fileExtensions ?? null}
          isBusy={isBusy}
          busyMessage={busyMessage}
          onFiles={(files) => void uploadFiles(files)}
        />
      </Section>

      <Section label="Your sources">
        {sources.length === 0 ? (
          <EmptyState>No sources yet.</EmptyState>
        ) : (
          sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              documents={documentsBySourceId[source.id] ?? []}
              isBusy={isBusy}
              armedId={removalAwaitingConfirmId}
              onArm={setRemovalAwaitingConfirmId}
              onSync={() =>
                void write("Syncing", () => sendJson(`/api/sources/${source.id}/sync`, "POST"))
              }
              onDeleteSource={() =>
                void write("Removing", () => sendJson(`/api/sources/${source.id}`, "DELETE"))
              }
              onDeleteDocument={(documentId) =>
                void write("Deleting", () =>
                  sendJson(`/api/sources/${source.id}/documents/${documentId}`, "DELETE"),
                )
              }
            />
          ))
        )}
      </Section>

      <Section label="Connect a provider">
        <ConnectorList
          providers={connectors?.providers ?? []}
          sources={sources}
          isBusy={isBusy}
          onConnect={(provider) => void connectProvider(provider)}
        />
      </Section>
    </PageLayout>
  );
}
