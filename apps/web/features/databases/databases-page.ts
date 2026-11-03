import { Component, signal, type OnInit } from "@angular/core";

import type {
  CreateDatabaseConnectionRequest,
  CreateDatabaseConnectionResponse,
  DatabaseConnection,
  ListDatabaseConnectionsResponse,
  TestDatabaseConnectionResponse,
} from "@knowledgestack/api-contract/database-connections";

import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { PageRequest } from "@/lib/page-request";

import { ConnectionCard } from "./connection-card";
import { RegisterForm } from "./register-form";

@Component({
  selector: "ks-databases-page",
  host: { style: "display: contents" },
  imports: [ConnectionCard, EmptyState, PageLayout, RegisterForm, Section],
  template: `
    <div
      ksPageLayout
      [title]="'Databases'"
      subtitle="The agent queries these databases to answer questions and puts the results in its answers."
      [notice]="request.notice()"
    >
      <section ksSection label="Your databases">
        @if (request.isBusy()) {
          <p class="databases-busy" sectionAside>{{ request.busyMessage() }}</p>
        }
        @if (databaseConnections().length === 0) {
          <p ksEmptyState>No databases yet. Register one below.</p>
        } @else {
          @for (databaseConnection of databaseConnections(); track databaseConnection.id) {
            <article
              ksConnectionCard
              [databaseConnection]="databaseConnection"
              [isBusy]="request.isBusy()"
              [armedId]="removalAwaitingConfirmId()"
              (arm)="removalAwaitingConfirmId.set($event)"
              (test)="testConnection(databaseConnection)"
              (delete)="removeConnection(databaseConnection)"
            ></article>
          }
        }
      </section>

      <section ksSection label="Register a database">
        <form ksRegisterForm [isBusy]="request.isBusy()" [onSubmit]="registerConnection"></form>
      </section>
    </div>
  `,
})
export class DatabasesPage implements OnInit {
  protected readonly databaseConnections = signal<DatabaseConnection[]>([]);
  protected readonly removalAwaitingConfirmId = signal<string | null>(null);
  protected readonly request = new PageRequest();

  ngOnInit(): void {
    this.loadConnections().catch((error: unknown) => this.request.reportFailure(error, "The databases did not load."));
  }

  private async loadConnections(): Promise<void> {
    const body = await requestJson<ListDatabaseConnectionsResponse>("/api/database-connections");
    this.databaseConnections.set(body.databaseConnections);
  }

  private write(busyText: string, send: () => Promise<unknown>, successText: string): Promise<boolean> {
    return this.request
      .runRequest(
        busyText,
        async () => {
          await send();
          await this.loadConnections();
        },
        successText,
      )
      .finally(() => this.removalAwaitingConfirmId.set(null));
  }

  // An arrow, because RegisterForm calls it detached from this page.
  protected readonly registerConnection = (request: CreateDatabaseConnectionRequest): Promise<boolean> =>
    this.write(
      "Opening a connection",
      async () => {
        const body = await requestJson<CreateDatabaseConnectionResponse>("/api/database-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!body.success) {
          throw new Error(body.message);
        }
      },
      `${request.name} is registered. Ask a question about it.`,
    );

  protected testConnection(databaseConnection: DatabaseConnection): Promise<boolean> {
    return this.write(
      "Opening a connection",
      async () => {
        const body = await requestJson<TestDatabaseConnectionResponse>(
          `/api/database-connections/${databaseConnection.id}/test`,
          { method: "POST" },
        );
        if (body.message !== "") {
          throw new Error(body.message);
        }
      },
      `Connected to ${databaseConnection.name}.`,
    );
  }

  protected removeConnection(databaseConnection: DatabaseConnection): Promise<boolean> {
    return this.write(
      "Removing",
      () => sendJson(`/api/database-connections/${databaseConnection.id}`, "DELETE"),
      `${databaseConnection.name} is removed.`,
    );
  }
}
