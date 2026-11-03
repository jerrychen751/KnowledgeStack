import { Component, type OnInit, signal } from "@angular/core";

import type {
  ListDocumentsResponse,
  ListSourcesResponse,
  ReadConnectorStatusResponse,
  SaveUploadsRequest,
  Source,
  SourceDocument,
  SourceProvider,
  StartAuthorizationResponse,
} from "@knowledgestack/api-contract/sources";

import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { PageRequest } from "@/lib/page-request";

import { ConnectorList } from "./connector-list";
import { SourceCard } from "./source-card";
import { UploadDropZone } from "./upload-drop-zone";

@Component({
  selector: "ks-sources-page",
  host: { style: "display: contents" },
  imports: [ConnectorList, EmptyState, PageLayout, Section, SourceCard, UploadDropZone],
  templateUrl: "./sources-page.html",
})
export class SourcesPage implements OnInit {
  // readonly state = signal<T>(initialValue);
  protected readonly sources = signal<Source[]>([]);
  protected readonly documentsBySourceId = signal<Record<string, SourceDocument[]>>({});
  protected readonly connectors = signal<ReadConnectorStatusResponse | null>(null);
  protected readonly removalAwaitingConfirmId = signal<string | null>(null);
  protected readonly request = new PageRequest();

  ngOnInit(): void {
    requestJson<ReadConnectorStatusResponse>("/api/sources/connectors")
      .then((connectors) => this.connectors.set(connectors))
      .catch(() => this.connectors.set(null));

    const parameters = new URLSearchParams(window.location.search);
    const failure = parameters.get("error");
    if (failure !== null) {
      this.request.notice.set({ text: failure, failed: true });
      this.loadSources().catch(() => undefined);
      return;
    }

    const shouldSyncTheGrant = parameters.get("connected") !== null;

    void this.loadSources()
      .catch((error: unknown) => {
        this.request.reportFailure(error, "The sources did not load.");
        return [] as Source[];
      })
      .then(async (loaded) => {
        if (!shouldSyncTheGrant) {
          return;
        }

        const unsynced = loaded.filter((source) => source.lastSyncedAt === null);
        if (unsynced.length === 0) {
          this.request.notice.set({ text: "Connected.", failed: false });
          return;
        }

        const failures: string[] = [];
        await this.request.runRequest(
          `Syncing ${unsynced.length} ${unsynced.length === 1 ? "source" : "sources"}`,
          async () => {
            for (const source of unsynced) {
              await sendJson(`/api/sources/${source.id}/sync`, "POST").catch(() =>
                failures.push(source.externalDisplayName),
              );
            }
            await this.loadSources();
          },
        );

        this.request.notice.set(
          failures.length === 0
            ? {
                text: `Connected. ${unsynced.length} ${unsynced.length === 1 ? "source is" : "sources are"} searchable now.`,
                failed: false,
              }
            : {
                text: `Connected, but ${failures.length} of ${unsynced.length} did not sync: ${failures.join(", ")}. Sync ${failures.length === 1 ? "it" : "them"} again above.`,
                failed: true,
              },
        );
      });
  }

  private async loadSources(): Promise<Source[]> {
    // Absolute URL contains protocol (http/https) and host; relative URL may either start from root of site ('/' prefix)
    // or from relative directory (no '/' prefix)
    const body = await requestJson<ListSourcesResponse>("/api/sources");
    this.sources.set(body.sources);

    const documents = await Promise.all(
      body.sources.map(async (source) => {
        const documentBody = await requestJson<ListDocumentsResponse>(
          `/api/sources/${source.id}/documents`,
        ).catch(() => ({ documents: [] }));
        return [source.id, documentBody.documents] as const;
      }),
    );
    this.documentsBySourceId.set(Object.fromEntries(documents));
    return body.sources;
  }

  private write(busyText: string, send: () => Promise<unknown>): Promise<boolean> {
    return this.request
      .runRequest(busyText, async () => {
        await send();
        await this.loadSources();
      })
      .finally(() => this.removalAwaitingConfirmId.set(null));
  }

  protected async uploadFiles(fileList: FileList | null): Promise<void> {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    const payload = await Promise.all(
      files.map(async (file) => ({ name: file.name, text: await file.text() })),
    );
    await this.write(`Syncing ${files.length} ${files.length === 1 ? "file" : "files"}`, () =>
      sendJson("/api/sources/uploads", "POST", { files: payload } satisfies SaveUploadsRequest),
    );
  }

  protected syncSource(sourceId: string): void {
    void this.write("Syncing", () => sendJson(`/api/sources/${sourceId}/sync`, "POST"));
  }

  protected deleteSource(sourceId: string): void {
    void this.write("Removing", () => sendJson(`/api/sources/${sourceId}`, "DELETE"));
  }

  protected deleteDocument(sourceId: string, documentId: string): void {
    void this.write("Deleting", () =>
      sendJson(`/api/sources/${sourceId}/documents/${documentId}`, "DELETE"),
    );
  }

  protected async connectProvider(provider: SourceProvider): Promise<void> {
    try {
      const body = await requestJson<StartAuthorizationResponse>(
        `/api/sources/connect/${provider}`,
      );
      window.location.href = body.authorizeUrl;
    } catch (error) {
      this.request.reportFailure(error, `The API returned no ${provider} authorization URL.`);
    }
  }
}
