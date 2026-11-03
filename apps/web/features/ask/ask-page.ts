import {
  Component,
  afterRenderEffect,
  computed,
  effect,
  input,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from "@angular/core";

import type { ListModelsResponse } from "@knowledgestack/api-contract/chat";
import type { ListSourcesResponse, Source } from "@knowledgestack/api-contract/sources";

import { requestJson } from "@/lib/api-client";

import { ChatList } from "./chat-list";
import { ChatRows } from "./chat-rows";
import { CitationRail } from "./citation-rail";
import { Composer } from "./composer";
import { OpenChat } from "./open-chat";
import { Opening } from "./opening";
import { TurnList } from "./turn-list";

@Component({
  selector: "ks-ask-page",
  host: { style: "display: contents" },
  imports: [ChatList, CitationRail, Composer, Opening, TurnList],
  templateUrl: "./ask-page.html",
})
export class AskPage {
  readonly chatId = input<string | null>(null);
  protected readonly question = signal("");
  protected readonly selectedTurnIndex = signal<number | null>(null);
  protected readonly activeCitationIndex = signal<number | null>(null);
  protected readonly sources = signal<Source[] | null>(null);
  protected readonly modelIds = signal<readonly string[]>([]);
  protected readonly modelId = signal("");
  protected readonly chat = new OpenChat(this.chatId, this.modelId, this.modelIds);
  protected readonly chatRows = new ChatRows();
  protected readonly activeTurnIndex = computed(() => this.selectedTurnIndex() ?? this.chat.turns().length - 1);
  protected readonly activeTurn = computed(() => this.chat.turns()[this.activeTurnIndex()]);
  protected isPinnedToBottom = true;
  private readonly streamRef = viewChild.required<ElementRef<HTMLDivElement>>("stream");

  constructor() {
    // An effect and not ngOnInit, because ngOnInit runs before the chat read that OpenChat's effect starts, and these reads leave after it.
    effect(() => {
      untracked(() => {
        requestJson<ListSourcesResponse>("/api/sources")
          .then((body) => this.sources.set(body.sources))
          .catch(() => this.sources.set([]));

        requestJson<ListModelsResponse>("/api/chat/models")
          .then((body) => {
            this.modelIds.set(body.modelIds);
            this.modelId.set(body.defaultModelId);
          })
          .catch(() => this.modelIds.set([]));
      });
    });

    effect(() => {
      this.chat.openChatId();
      this.chat.isRunning();
      untracked(() => void this.chatRows.refreshChats());
    });

    afterRenderEffect(() => {
      this.chat.turns();
      const stream = this.streamRef().nativeElement;
      if (this.isPinnedToBottom) {
        stream.scrollTop = stream.scrollHeight;
      }
    });
  }

  protected submitQuestion(): void {
    const question = this.question();
    if (this.chat.isRunning() || this.chat.isLoadingChat() || question.trim() === "") {
      return;
    }

    this.selectedTurnIndex.set(null);
    this.activeCitationIndex.set(null);
    this.question.set("");
    this.isPinnedToBottom = true;
    void this.chat.askQuestion(question);
  }

  protected showChat(nextChatId: string | null): void {
    this.selectedTurnIndex.set(null);
    this.activeCitationIndex.set(null);
    this.isPinnedToBottom = true;
    this.chat.openChat(nextChatId);
  }

  protected async deleteChat(deletedChatId: string): Promise<void> {
    const openChatId = this.chat.openChatId();
    if (await this.chatRows.deleteChat(deletedChatId)) {
      if (deletedChatId === openChatId) {
        this.showChat(null);
      }
    }
  }
}
