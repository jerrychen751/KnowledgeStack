"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type {
  CreateDatabaseConnectionRequest,
  CreateDatabaseConnectionResponse,
  DatabaseConnection,
  ListDatabaseConnectionsResponse,
  TestDatabaseConnectionResponse,
} from "@knowledgestack/shared/database-connections";

import { EmptyState } from "@/components/empty-state";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/section";
import { requestJson, sendJson } from "@/lib/api-client";
import { usePageRequest } from "@/lib/use-page-request";

import { ConnectionCard } from "./connection-card";
import styles from "./databases.module.css";
import { RegisterForm } from "./register-form";

export function DatabasesPage(): ReactNode {
  const [databaseConnections, setDatabaseConnections] = useState<DatabaseConnection[]>([]);
  const [removalAwaitingConfirmId, setRemovalAwaitingConfirmId] = useState<string | null>(null);
  const { notice, busyMessage, isBusy, reportFailure, runRequest } = usePageRequest();

  const loadConnections = useCallback(async () => {
    const body = await requestJson<ListDatabaseConnectionsResponse>("/api/database-connections");
    setDatabaseConnections(body.databaseConnections);
  }, []);

  useEffect(() => {
    loadConnections().catch((error: unknown) =>
      reportFailure(error, "The databases did not load."),
    );
  }, [loadConnections, reportFailure]);

  const write = useCallback(
    (busyText: string, send: () => Promise<unknown>, successText: string) =>
      runRequest(
        busyText,
        async () => {
          await send();
          await loadConnections();
        },
        successText,
      ).finally(() => setRemovalAwaitingConfirmId(null)),
    [loadConnections, runRequest],
  );

  const registerConnection = useCallback(
    (request: CreateDatabaseConnectionRequest) =>
      write(
        "Opening a connection",
        async () => {
          const body = await requestJson<CreateDatabaseConnectionResponse>(
            "/api/database-connections",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            },
          );
          if (!body.success) {
            throw new Error(body.message);
          }
        },
        `${request.name} is registered. Ask a question about it.`,
      ),
    [write],
  );

  const testConnection = useCallback(
    (databaseConnection: DatabaseConnection) =>
      write(
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
        `${databaseConnection.name} answered.`,
      ),
    [write],
  );

  return (
    <PageLayout
      title="Databases"
      subtitle="The agent queries these databases to answer a question, and reads the rows back into the answer."
      notice={notice}
    >
      <Section
        label="Your databases"
        aside={isBusy ? <p className={styles.busy}>{busyMessage}</p> : null}
      >
        {databaseConnections.length === 0 ? (
          <EmptyState>No database yet. Register one below.</EmptyState>
        ) : (
          databaseConnections.map((databaseConnection) => (
            <ConnectionCard
              key={databaseConnection.id}
              databaseConnection={databaseConnection}
              isBusy={isBusy}
              armedId={removalAwaitingConfirmId}
              onArm={setRemovalAwaitingConfirmId}
              onTest={() => void testConnection(databaseConnection)}
              onDelete={() =>
                void write(
                  "Removing",
                  () => sendJson(`/api/database-connections/${databaseConnection.id}`, "DELETE"),
                  `${databaseConnection.name} is removed.`,
                )
              }
            />
          ))
        )}
      </Section>

      <Section label="Register a database">
        <RegisterForm isBusy={isBusy} onSubmit={registerConnection} />
      </Section>
    </PageLayout>
  );
}
