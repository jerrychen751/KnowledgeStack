import { Component, input, output } from "@angular/core";

import type { SourceDocument } from "@knowledgestack/api-contract/sources";

import { formatTime } from "@/lib/format-time";

/** One document of a source: its title, the number of chunks it produced, and the time the last index pass wrote them. A source the person uploaded shows a remove button, which reads "Delete" once `isArmed` is true. */
@Component({
  selector: "div[ksDocumentRow]",
  host: { class: "sources-document-row" },
  template: `
    <span class="sources-document-name">{{ document().externalTitle }}</span>
    <span class="sources-document-meta" [class.sources-document-skipped]="document().chunkCount === 0">{{
      document().documentType === "attachment"
        ? "not text"
        : document().chunkCount + " " + (document().chunkCount === 1 ? "chunk" : "chunks")
    }}</span>
    <span class="sources-document-meta sources-document-time">{{ formatTime(document().lastIndexedAt) }}</span>
    @if (isRemovable()) {
      <button
        type="button"
        class="sources-document-remove"
        [class.sources-document-remove-armed]="isArmed()"
        [disabled]="isBusy()"
        [attr.aria-label]="(isArmed() ? 'Delete ' : 'Remove ') + document().externalTitle"
        (click)="removeClick.emit()"
      >{{ isArmed() ? "Delete" : "Remove" }}</button>
    }
  `,
})
export class DocumentRow {
  readonly document = input.required<SourceDocument>();
  readonly isRemovable = input.required<boolean>();
  readonly isArmed = input.required<boolean>();
  readonly isBusy = input.required<boolean>();
  readonly removeClick = output();
  protected readonly formatTime = formatTime;
}
