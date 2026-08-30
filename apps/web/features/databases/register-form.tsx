"use client";

import { useState, type ReactNode } from "react";

import type { CreateDatabaseConnectionRequest } from "@knowledgestack/shared/database-connections";

import { Button } from "@/components/button";
import { Label } from "@/components/label";

import styles from "./databases.module.css";

/** The form that registers one business database, or corrects the credentials of a name the workspace already holds. It clears itself only after `onSubmit` reports true, so a rejected registration keeps every value the person typed. */
export function RegisterForm({
  isBusy,
  onSubmit,
}: {
  isBusy: boolean;
  onSubmit: (request: CreateDatabaseConnectionRequest) => Promise<boolean>;
}): ReactNode {
  const emptyForm = {
    name: "",
    description: "",
    host: "localhost",
    port: "5432",
    database: "",
    username: "",
    password: "",
  };
  const [form, setForm] = useState(emptyForm);
  const changeField = (field: keyof typeof emptyForm, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));
  const isIncomplete = Object.values(form).some((value) => value.trim() === "");

  const fields = [
    { key: "name", label: "Name", placeholder: "warehouse", maxLength: 60, isMono: true },
    { key: "database", label: "Database", placeholder: "company", maxLength: 63, isMono: true },
    { key: "host", label: "Host", placeholder: "localhost", maxLength: 255, isMono: true },
    { key: "port", label: "Port", placeholder: "5432", maxLength: 5, isMono: true },
    { key: "username", label: "Read-only role", placeholder: "agent_readonly", maxLength: 63, isMono: true },
  ] as const;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          name: form.name,
          description: form.description,
          engine: "POSTGRESQL",
          host: form.host,
          port: Number(form.port),
          database: form.database,
          username: form.username,
          password: form.password,
        }).then((registered) => {
          if (registered) {
            setForm(emptyForm);
          }
        });
      }}
    >
      <div className={styles.fields}>
        {fields.map((field) => (
          <label key={field.key} className={styles.field}>
            <Label>{field.label}</Label>
            <input
              className={`${styles.input} ${field.isMono ? styles.monoInput : ""}`}
              value={form[field.key]}
              onChange={(event) => changeField(field.key, event.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              inputMode={field.key === "port" ? "numeric" : undefined}
            />
          </label>
        ))}
        <label className={styles.field}>
          <Label>Password</Label>
          <input
            className={styles.input}
            type="password"
            value={form.password}
            onChange={(event) => changeField("password", event.target.value)}
            maxLength={255}
            autoComplete="new-password"
          />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <Label>What it holds</Label>
          <input
            className={styles.input}
            value={form.description}
            onChange={(event) => changeField("description", event.target.value)}
            placeholder="Orders and invoices from the ERP"
            maxLength={500}
          />
        </label>
      </div>

      <div className={styles.formFoot}>
        <p className={styles.formNote}>
          The agent reads the description to choose between two databases, and it runs every statement as
          the role you give here. Register a read-only role. Send a name the workspace already holds to
          correct its credentials.
        </p>
        <Button type="submit" variant="primary" disabled={isBusy || isIncomplete}>
          Register
        </Button>
      </div>
    </form>
  );
}
