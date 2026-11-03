import { Component, input, output } from "@angular/core";

import { AnswerBody } from "./answer-body";
import { QueryResultTable } from "./query-result-table";
import type { Turn } from "@knowledgestack/api-contract/chat";

/** The thread: one article per turn, with the question, the model, the tool steps, the rows of every database query, and the answer. Only the turn at `activeTurnIndex` highlights a citation mark, because the rail shows that turn alone. */
@Component({
  selector: "div[ksTurnList]",
  host: { class: "ask-stream-inner" },
  imports: [AnswerBody, QueryResultTable],
  template: `
    @for (turn of turns(); track $index; let position = $index) {
      <article class="ask-turn" [class.ask-turn-active]="position === activeTurnIndex()">
        <h2 class="ask-question">{{ turn.question }}</h2>
        @if (turn.modelId !== "") {
          <p class="ask-step">
            <span class="ask-step-label">model</span>
            <span class="ask-step-text">{{ turn.modelId }}</span>
          </p>
        }
        @for (step of turn.displayTexts; track $index) {
          <p class="ask-step"><span class="ask-step-text">{{ step }}</span></p>
        }
        @if (turn.state === "running" && turn.displayTexts.length === 0) {
          <p class="ask-step"><span class="ask-step-label">reading the question</span></p>
        }
        @for (result of turn.queryResults; track $index) {
          <div ksQueryResultTable [result]="result"></div>
        }
        @if (turn.answer !== "") {
          <div class="ask-answer">
            <ks-answer-body
              [text]="turn.answer"
              [activeCitationIndex]="position === activeTurnIndex() ? activeCitationIndex() : null"
              (citationSelect)="citationSelect.emit({ turnIndex: position, citationIndex: $event })"
            />
          </div>
        }
        @if (turn.state === "running") {
          <span class="ask-caret"></span>
        }
        @if (turn.state === "error") {
          <p class="ask-failure">{{ turn.errorMessage }}</p>
        }
      </article>
    }
  `,
})
export class TurnList {
  readonly turns = input.required<Turn[]>();
  readonly activeTurnIndex = input.required<number>();
  readonly activeCitationIndex = input.required<number | null>();
  readonly citationSelect = output<{ turnIndex: number; citationIndex: number }>();
}
