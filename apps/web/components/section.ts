import { Component, input } from "@angular/core";

import { Label } from "./label";

/** One band of a page: an uppercase label, an optional element on the right of that label, and the body under both. */
@Component({
  selector: "section[ksSection]",
  host: { class: "ui-section" },
  imports: [Label],
  template: `
    <div class="ui-section-head">
      <p ksLabel>{{ label() }}</p>
      <ng-content select="[sectionAside]" />
    </div>
    <ng-content />
  `,
})
export class Section {
  readonly label = input.required<string>();
}
