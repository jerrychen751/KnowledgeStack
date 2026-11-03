import { Component, input } from "@angular/core";

import type { Notice } from "@/lib/page-request";

/** The frame every list page shares: the centred column, the title, the subtitle, and the notice line under them. Pass `notice` straight from `PageRequest`; a null value renders no line. */
@Component({
  selector: "div[ksPageLayout]",
  host: { class: "ui-page" },
  template: `
    <header class="ui-page-head">
      <h1 class="ui-title">{{ title() }}</h1>
      <p class="ui-subtitle">{{ subtitle() }}</p>
    </header>

    @if (notice(); as notice) {
      <p class="ui-notice" [class.ui-notice-failure]="notice.failed">{{ notice.text }}</p>
    }

    <ng-content />
  `,
})
export class PageLayout {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly notice = input.required<Notice | null>();
}
