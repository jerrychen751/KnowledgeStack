import { NgTemplateOutlet } from "@angular/common";
import { Component, computed, input, output } from "@angular/core";

type InlineToken = { kind: "text" | "code" | "strong"; text: string } | { kind: "citation"; citationIndex: number };

function splitInline(text: string): InlineToken[] {
  // The model writes no Markdown beyond these three forms, so this split is the whole parser.
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[\d+\])/g).flatMap((token): InlineToken[] => {
    if (token.length > 1 && token.startsWith("`") && token.endsWith("`")) {
      return [{ kind: "code", text: token.slice(1, -1) }];
    }
    if (token.length > 4 && token.startsWith("**") && token.endsWith("**")) {
      return [{ kind: "strong", text: token.slice(2, -2) }];
    }

    const marker = /^\[(\d+)\]$/.exec(token);
    if (marker === null) {
      return token === "" ? [] : [{ kind: "text", text: token }];
    }

    return [{ kind: "citation", citationIndex: Number(marker[1]) }];
  });
}

/** Render the answer text of one turn. Each `[n]` marker becomes a button that opens chunk `n` in the citation rail, and `activeCitationIndex` names the marker to highlight. */
@Component({
  selector: "ks-answer-body",
  host: { style: "display: contents" },
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #inline let-tokens>
      @for (token of tokens; track $index) {
        @switch (token.kind) {
          @case ("code") {
            <code>{{ token.text }}</code>
          }
          @case ("strong") {
            <strong>{{ token.text }}</strong>
          }
          @case ("citation") {
            <button
              type="button"
              class="ask-citation-mark"
              [class.ask-citation-mark-active]="token.citationIndex === activeCitationIndex()"
              (click)="citationSelect.emit(token.citationIndex)"
              [attr.aria-label]="'Show chunk ' + token.citationIndex"
            >{{ token.citationIndex }}</button>
          }
          @default {
            <ng-container>{{ token.text }}</ng-container>
          }
        }
      }
    </ng-template>

    @for (block of blocks(); track $index) {
      @if (block.isList) {
        <ul>
          @for (line of block.lines; track $index) {
            <li><ng-container [ngTemplateOutlet]="inline" [ngTemplateOutletContext]="{ $implicit: line }" /></li>
          }
        </ul>
      } @else {
        <p><ng-container [ngTemplateOutlet]="inline" [ngTemplateOutletContext]="{ $implicit: block.lines[0] }" /></p>
      }
    }
  `,
})
export class AnswerBody {
  readonly text = input.required<string>();
  readonly activeCitationIndex = input.required<number | null>();
  readonly citationSelect = output<number>();
  protected readonly blocks = computed(() =>
    this.text()
      .split(/\n{2,}/)
      .filter((block) => block.trim() !== "")
      .map((block) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return { isList: true, lines: lines.map((line) => splitInline(line.replace(/^\s*[-*]\s+/, ""))) };
        }

        return { isList: false, lines: [splitInline(block)] };
      }),
  );
}
