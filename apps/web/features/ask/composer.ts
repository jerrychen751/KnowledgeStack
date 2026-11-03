import { Component, afterRenderEffect, input, output, viewChild, type ElementRef } from "@angular/core";

import type { ContextUsage } from "@knowledgestack/api-contract/chat";

import { Button } from "@/components/button";

import { ContextRing } from "./context-ring";

/** The question box under the thread, with the model picker and the context ring beside it. The textarea grows with the text. Enter submits and Shift with Enter writes a new line. */
@Component({
  selector: "form[ksComposer]",
  host: { class: "ask-composer", "(submit)": "$event.preventDefault(); questionSubmit.emit()" },
  imports: [Button, ContextRing],
  templateUrl: "./composer.html",
})
export class Composer {
  readonly question = input.required<string>();
  readonly isRunning = input.required<boolean>();
  readonly isLoadingChat = input.required<boolean>();
  readonly modelIds = input.required<readonly string[]>();
  readonly modelId = input.required<string>();
  readonly usage = input.required<ContextUsage | null>();
  readonly questionChange = output<string>();
  // Not `submit`: the host is a form, so a parent listening for `(submit)` would also catch the native event.
  readonly questionSubmit = output();
  readonly modelIdChange = output<string>();
  private readonly inputRef = viewChild.required<ElementRef<HTMLTextAreaElement>>("input");

  constructor() {
    afterRenderEffect(() => {
      const question = this.question();
      const input = this.inputRef().nativeElement;
      // The [value] binding skips a write when the question returns to the last value it drew. Text typed and
      // sent before Angular renders it never reaches the binding, so the box would keep that text after the
      // page clears the question. Writing the difference here keeps the box equal to the question, as React did.
      if (input.value !== question) {
        input.value = question;
      }
      // Measure from zero, not from auto: a flex item stretches under auto and reports the stretched height.
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    });
  }

  protected submitOnEnter(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.questionSubmit.emit();
    }
  }
}
