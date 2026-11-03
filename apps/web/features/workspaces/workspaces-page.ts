import { Component, type OnDestroy, type OnInit, signal } from "@angular/core";

import type {
  CreateWorkspaceRequest,
  JoinWorkspaceRequest,
  LeaveWorkspaceRequest,
  ListWorkspacesResponse,
  Workspace,
} from "@knowledgestack/api-contract/workspaces";

import { Button } from "@/components/button";
import { Label } from "@/components/label";
import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { PageRequest } from "@/lib/page-request";
import { workspaceChangedEvent } from "@/lib/workspace-changed-event";

import { WorkspaceCard } from "./workspace-card";

@Component({
  selector: "ks-workspaces-page",
  host: { style: "display: contents" },
  imports: [Button, EmptyState, Label, PageLayout, Section, WorkspaceCard],
  templateUrl: "./workspaces-page.html",
})
export class WorkspacesPage implements OnInit, OnDestroy {
  protected readonly workspaces = signal<Workspace[]>([]);
  protected readonly activeWorkspaceId = signal<string | null>(null);
  protected readonly workspaceName = signal("");
  protected readonly joinCode = signal("");
  protected readonly armedId = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);
  private copiedTimer: number | undefined = undefined;
  protected readonly request = new PageRequest();

  private async loadWorkspaces(): Promise<void> {
    const body = await requestJson<ListWorkspacesResponse>("/api/workspaces");
    this.workspaces.set(body.workspaces);
    this.activeWorkspaceId.set(body.activeWorkspaceId);
  }

  ngOnInit(): void {
    this.loadWorkspaces().catch((error: unknown) =>
      this.request.reportFailure(error, "The workspaces did not load."),
    );
  }

  private write(busyText: string, send: () => Promise<unknown>, successText: string): Promise<boolean> {
    return this.request.runRequest(
      busyText,
      async () => {
        await send();
        await this.loadWorkspaces();
        window.dispatchEvent(new Event(workspaceChangedEvent));
      },
      successText,
    );
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.copiedTimer);
  }

  protected async copyJoinCode(workspaceId: string, code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.request.notice.set(null);
      this.copiedId.set(workspaceId);
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = window.setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      this.request.notice.set({ text: `Copy the code by hand: ${code}`, failed: true });
    }
  }

  protected openWorkspace(workspace: Workspace): void {
    void this.write(
      "Opening the workspace",
      () => sendJson(`/api/workspaces/${workspace.id}/select`, "POST"),
      `${workspace.name} is open.`,
    );
  }

  protected leaveWorkspace(workspace: Workspace): void {
    void this.write(
      "Leaving the workspace",
      () =>
        sendJson(`/api/workspaces/${workspace.id}/membership`, "DELETE", {
          isLastMember: workspace.memberCount === 1,
        } satisfies LeaveWorkspaceRequest),
      workspace.memberCount === 1
        ? `You left ${workspace.name}. You were its last member, so it is deleted.`
        : `You left ${workspace.name}. Every MCP token you made for it is revoked.`,
    ).then((left) => {
      if (left) {
        this.armedId.set(null);
        return;
      }

      // A refused leave keeps the card armed, and the fresh member count gives it the warning that now applies.
      this.loadWorkspaces().catch((error: unknown) =>
        this.request.reportFailure(error, "The workspaces did not load."),
      );
    });
  }

  protected createWorkspace(): void {
    void this.write(
      "Creating the workspace",
      () =>
        sendJson("/api/workspaces", "POST", {
          name: this.workspaceName(),
        } satisfies CreateWorkspaceRequest),
      `${this.workspaceName()} is open. Share its join code to add a member.`,
    ).then((created) => {
      if (created) {
        this.workspaceName.set("");
      }
    });
  }

  protected joinWorkspace(): void {
    void this.write(
      "Joining the workspace",
      () =>
        sendJson("/api/workspaces/join", "POST", {
          code: this.joinCode(),
        } satisfies JoinWorkspaceRequest),
      "You joined the workspace. It's open now.",
    ).then((joined) => {
      if (joined) {
        this.joinCode.set("");
      }
    });
  }

  protected setJoinCode(codeInput: HTMLInputElement): void {
    const code = codeInput.value
      .toUpperCase()
      .replace(/[^A-HJ-KM-NP-Z2-9]/g, "")
      .slice(0, 8);
    // A dropped character leaves the signal unchanged, so the [value] binding would not clear it from the box the way React's controlled input did.
    codeInput.value = code;
    this.joinCode.set(code);
  }
}
