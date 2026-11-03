import { Component, afterRenderEffect, computed, input, output, signal } from "@angular/core";

import { Label } from "@/components/label";

import type { Turn } from "@knowledgestack/api-contract/chat";

/** The right rail of the ask page. It lists every chunk the searches of `turn` retrieved, dims the ones the answer did not cite, and opens the full chunk text on a click. `turn` is undefined before the first question. */
@Component({
  selector: "aside[ksCitationRail]",
  host: { class: "ask-rail", "aria-label": "Citations" },
  imports: [Label],
  templateUrl: "./citation-rail.html",
})
export class CitationRail {
  readonly turn = input.required<Turn | undefined>();
  readonly activeTurnIndex = input.required<number>();
  readonly activeCitationIndex = input.required<number | null>();
  readonly select = output<number>();
  protected readonly openChunkIds = signal<string[]>([]);
  protected readonly tickPositions = Array.from({ length: 16 }, (_tick, tickPosition) => tickPosition);
  protected readonly Math = Math;
  // The retrieval returns more chunks than the answer uses, so the rail marks the ones it cited.
  protected readonly citedIndexes = computed(
    () => new Set([...(this.turn()?.answer ?? "").matchAll(/\[(\d+)\]/g)].map((marker) => Number(marker[1]))),
  );

  constructor() {
    afterRenderEffect(() => {
      const activeCitationIndex = this.activeCitationIndex();
      this.activeTurnIndex();
      if (activeCitationIndex !== null) {
        document
          .getElementById(`citation-${activeCitationIndex}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  protected toggleChunk(citationIndex: number, chunkId: string): void {
    this.select.emit(citationIndex);
    this.openChunkIds.update((previous) =>
      previous.includes(chunkId) ? previous.filter((openChunkId) => openChunkId !== chunkId) : [...previous, chunkId],
    );
  }

  protected stripMarkdown(text: string): string {
    return text.replace(/^#{1,6}\s+/gm, "").replace(/\*\*/g, "").replace(/`/g, "");
  }
}
