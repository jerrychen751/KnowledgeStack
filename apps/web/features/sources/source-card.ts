import { Component, input, output } from "@angular/core";

import type { Source, SourceDocument } from "@knowledgestack/api-contract/sources";

import { Button } from "@/components/button";
import { Label } from "@/components/label";

import { DocumentRow } from "./document-row";
import { formatTime } from "@/lib/format-time";

/** One connected source: its counts, its last sync time, and the Sync and Remove actions. `armedId` names the source or the document whose next click deletes it, and is null when nothing is armed. Removal takes two clicks, because the API deletes every chunk of the source and cannot undo it. */
@Component({
  selector: "article[ksSourceCard]",
  host: { class: "sources-card" },
  imports: [Button, DocumentRow, Label],
  templateUrl: "./source-card.html",
})
export class SourceCard {
  readonly source = input.required<Source>();
  readonly documents = input.required<SourceDocument[]>();
  readonly isBusy = input.required<boolean>();
  readonly armedId = input.required<string | null>();
  readonly arm = output<string | null>();
  readonly sync = output();
  readonly deleteSource = output();
  readonly deleteDocument = output<string>();
  protected readonly formatTime = formatTime;
}
