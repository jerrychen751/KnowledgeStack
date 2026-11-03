import { Component, computed, input, signal } from "@angular/core";

import type { CreateDatabaseConnectionRequest } from "@knowledgestack/api-contract/database-connections";

import { Button } from "@/components/button";
import { Label } from "@/components/label";

const emptyForm = {
  name: "",
  description: "",
  host: "localhost",
  port: "5432",
  database: "",
  username: "",
  password: "",
};

/** The form that registers one business database, or corrects the credentials of a name the workspace already holds. It clears itself only after `onSubmit` reports true, so a rejected registration keeps every value the person typed. */
@Component({
  selector: "form[ksRegisterForm]",
  host: { class: "databases-form", "(submit)": "submitForm($event)" },
  imports: [Button, Label],
  templateUrl: "./register-form.html",
})
export class RegisterForm {
  readonly isBusy = input.required<boolean>();
  readonly onSubmit = input.required<(request: CreateDatabaseConnectionRequest) => Promise<boolean>>();
  protected readonly form = signal(emptyForm);
  protected readonly ssl = signal(true);
  protected readonly isIncomplete = computed(() => Object.values(this.form()).some((value) => value.trim() === ""));

  protected readonly fields = [
    { key: "name", label: "Name", placeholder: "warehouse", maxLength: 60, isMono: true },
    { key: "database", label: "Database", placeholder: "company", maxLength: 63, isMono: true },
    { key: "host", label: "Host", placeholder: "localhost", maxLength: 255, isMono: true },
    { key: "port", label: "Port", placeholder: "5432", maxLength: 5, isMono: true },
    { key: "username", label: "Read-only role", placeholder: "agent_readonly", maxLength: 63, isMono: true },
  ] as const;

  protected changeField(field: keyof typeof emptyForm, value: string): void {
    this.form.update((previous) => ({ ...previous, [field]: value }));
  }

  protected submitForm(event: Event): void {
    event.preventDefault();
    const form = this.form();
    void this.onSubmit()({
      name: form.name,
      description: form.description,
      engine: "POSTGRESQL",
      host: form.host,
      port: Number(form.port),
      database: form.database,
      username: form.username,
      password: form.password,
      ssl: this.ssl(),
    }).then((registered) => {
      if (registered) {
        this.form.set(emptyForm);
        this.ssl.set(true);
      }
    });
  }
}
