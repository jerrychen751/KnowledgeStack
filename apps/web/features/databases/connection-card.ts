import { Component, computed, input, output } from "@angular/core";

import type { DatabaseConnection } from "@knowledgestack/api-contract/database-connections";

import { Button } from "@/components/button";
import { Label } from "@/components/label";
import { formatTime } from "@/lib/format-time";

/** One registered database: where it is, what the last check reported, and the Test and Remove actions. `armedId` names the connection whose next click deletes it, and is null when nothing is armed. Removal takes two clicks, because the agent stops answering questions about that database at once. */
@Component({
  selector: "article[ksConnectionCard]",
  host: { class: "databases-card" },
  imports: [Button, Label],
  templateUrl: "./connection-card.html",
})
export class ConnectionCard {
  readonly databaseConnection = input.required<DatabaseConnection>();
  readonly isBusy = input.required<boolean>();
  readonly armedId = input.required<string | null>();
  readonly arm = output<string | null>();
  readonly test = output();
  readonly delete = output();
  protected readonly isActive = computed(() => this.databaseConnection().status === "active");
  protected readonly formatTime = formatTime;
}
