import { Component, computed, input } from "@angular/core";

import type { ContextUsage } from "@knowledgestack/api-contract/chat";

/** The gauge beside the composer that reads how full the chat is. It turns to the warning colour at 80 percent, where a compaction is close. */
@Component({
  selector: "span[ksContextRing]",
  host: {
    class: "ask-context-ring",
    "[class.ask-context-ring-high]": "usage().fraction >= 0.8",
    "[attr.title]": "title()",
  },
  template: `
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle class="ask-ring-track" cx="8" cy="8" r="6" />
      <circle
        class="ask-ring-fill"
        cx="8"
        cy="8"
        r="6"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="circumference * (1 - usage().fraction)"
      />
    </svg>
    <span class="ask-context-percent">{{ Math.round(usage().fraction * 100) }}% context</span>
  `,
})
export class ContextRing {
  readonly usage = input.required<ContextUsage>();
  protected readonly circumference = 2 * Math.PI * 6;
  protected readonly Math = Math;
  protected readonly title = computed(() => {
    const usage = this.usage();
    return `${usage.turnCount} of ${usage.maxTurnCount} turns and ${usage.tokenCount.toLocaleString()} of ${usage.maxTokenCount.toLocaleString()} tokens. The chat compacts at whichever it reaches first.`;
  });
}
