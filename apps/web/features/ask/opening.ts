import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";

import type { Source } from "@knowledgestack/api-contract/sources";

import { Label } from "@/components/label";

/** What the thread shows before the first question: the claim the product makes, and the sources a question can reach. `sources` is null until the list arrives, and a source with no document is left out because no question can reach it. */
@Component({
  selector: "div[ksOpening]",
  host: { class: "ask-opening" },
  imports: [Label, RouterLink],
  template: `
    <h1 class="ask-opening-thesis">Ask a question about your documents.<span class="ask-opening-claim">Every claim in the answer points back to the chunk it came from.</span></h1>
    <div class="ask-indexed">
      <p ksLabel>{{ indexedSources().length === 0 ? "Nothing indexed" : "Indexed" }}</p>
      @if (indexedSources().length === 0) {
        <p class="ask-opening-note">Add Markdown or text files on the <a routerLink="/sources">Sources</a> page, then come back and ask.</p>
      } @else {
        <ul class="ask-indexed-list">
          @for (source of indexedSources(); track source.id) {
            <li class="ask-indexed-item">{{ source.externalDisplayName }} · {{ source.documentCount }} {{ source.documentCount === 1 ? "document" : "documents" }} · {{ source.chunkCount }} {{ source.chunkCount === 1 ? "chunk" : "chunks" }}</li>
          }
        </ul>
      }
    </div>
  `,
})
export class Opening {
  readonly sources = input.required<Source[] | null>();
  protected readonly indexedSources = computed(() => (this.sources() ?? []).filter((source) => source.documentCount > 0));
}
