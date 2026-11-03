import { Component, computed, input, output } from "@angular/core";

import type {
  ReadConnectorStatusResponse,
  Source,
  SourceProvider,
} from "@knowledgestack/api-contract/sources";

import { Button } from "@/components/button";

/** One card per provider the API can connect. A provider that already owns a working source shows the count in place of the Connect button, because a second grant for the same provider would replace the first. A provider whose grant expired keeps the button, because a new grant is the only way back. `missingVariables` names each environment variable the deployment must set before the provider can connect, and disables the button while it holds a name. */
@Component({
  selector: "div[ksConnectorList]",
  host: { class: "sources-connectors" },
  imports: [Button],
  template: `
    @for (card of cards(); track card.provider.provider) {
      <article class="sources-connector">
        <div class="sources-connector-head">
          <h2 class="sources-connector-name">{{ card.provider.provider }}</h2>
          @if (card.connectedCount > 0) {
            <span class="sources-connector-connected">Connected</span>
          }
        </div>
        <p class="sources-connector-detail">{{ card.detail }}</p>
        @if (card.connectedCount === 0 || card.needsReauth) {
          <div class="sources-connector-action">
            <button
              ksButton
              [disabled]="card.provider.missingVariables.length > 0 || isBusy()"
              [attr.aria-label]="'Connect ' + card.provider.provider"
              (click)="connect.emit(card.provider.provider)"
            >Connect</button>
          </div>
        }
      </article>
    }
  `,
})
export class ConnectorList {
  readonly providers = input.required<ReadConnectorStatusResponse["providers"]>();
  readonly sources = input.required<Source[]>();
  readonly isBusy = input.required<boolean>();
  readonly connect = output<SourceProvider>();

  protected readonly cards = computed(() =>
    this.providers().map((provider) => {
      const providerSources = this.sources().filter(
        (source) => source.provider === provider.provider,
      );
      const connectedCount = providerSources.length;
      const needsReauth = providerSources.some(
        (source) => source.status === "reauth_required",
      );
      const detail = needsReauth
        ? `The grant expired. Connect again to keep ${connectedCount === 1 ? "this source" : "these sources"} working.`
        : connectedCount > 0
          ? `${connectedCount} ${connectedCount === 1 ? "source" : "sources"} above. Remove ${connectedCount === 1 ? "it" : "them"} to connect a different account.`
          : provider.missingVariables.length > 0
            ? `Set ${provider.missingVariables.join(" and ")} on the server.`
            : "Grant access to the pages you want KnowledgeStack to read.";
      return { provider, connectedCount, needsReauth, detail };
    }),
  );
}
