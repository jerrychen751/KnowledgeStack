import { Injectable, Logger } from "@nestjs/common";
import { getEncoding, type Tiktoken } from "js-tiktoken";
import OpenAI from "openai";

import type { ChatMessage, ContextUsage } from "@knowledgestack/shared/chat";
import { AppConfig } from "../config/app-config.js";

@Injectable()
export class CompactionService {
  /**
   * When a conversation compacts, and how much of it survives.
   *
   * A conversation compacts when it reaches either limit, because each one runs out on its own: 100 short
   * turns cost far less than 256000 tokens, and 12 turns that quote whole documents cost far more.
   *
   * `keptTurnFraction` leaves the newest tenth of the turns as written, so the summary covers the older
   * nine tenths. `minKeptTurnCount` holds the floor at 2 turns, which the token limit alone would drop to
   * one: the question that arrives with the request is one of those two, and the turn before it is what
   * a follow-up question such as "and the second one?" refers to.
   */
  private readonly limits = {
    maxTurnCount: 100,
    maxTokenCount: 256000,
    keptTurnFraction: 0.1,
    minKeptTurnCount: 2,
  };

  private readonly client: OpenAI;

  private encoder: Tiktoken | undefined;

  constructor(appConfig: AppConfig) {
    this.client = new OpenAI({ apiKey: appConfig.openaiApiKey, maxRetries: 2 });
  }

  /** Count the tokens of one text as every GPT-5.6 model counts them. A model outside that family tokenizes differently, and the count drifts. */
  private countTokens(text: string): number {
    this.encoder ??= getEncoding("o200k_base");
    return this.encoder.encode(text).length;
  }

  /**
   * Group the messages into turns, newest last.
   *
   * A turn is one question and the answer to it. A turn opens at each user message, so an assistant message
   * never leads a group and a question never parts from its answer. An answer that failed leaves a turn of
   * one message, so a turn is not always a pair.
   */
  private splitTurns(messages: readonly ChatMessage[]): ChatMessage[][] {
    const turns: ChatMessage[][] = [];
    for (const message of messages) {
      if (message.role === "user" || turns.length === 0) {
        turns.push([]);
      }
      turns[turns.length - 1].push(message);
    }

    return turns;
  }

  /**
   * Measure the conversation the browser sent against the two compaction limits.
   *
   * The count covers the summary and the message content only. The instructions, the tool declarations and
   * the search results of one answer are not in it, because a compaction cannot shrink any of them.
   *
   * Each message costs four tokens beyond its content, because the Responses API frames the message with
   * its role and tiktoken reads the content alone.
   */
  measureUsage(summary: string, messages: readonly ChatMessage[]): ContextUsage {
    const roleFramingTokens = 4;
    const turnCount = this.splitTurns(messages).length;
    const tokenCount = messages.reduce(
      (total, message) => total + this.countTokens(message.content) + roleFramingTokens,
      summary === "" ? 0 : this.countTokens(summary),
    );

    return {
      turnCount,
      maxTurnCount: this.limits.maxTurnCount,
      tokenCount,
      maxTokenCount: this.limits.maxTokenCount,
      fraction: Math.min(
        1,
        Math.max(
          turnCount / this.limits.maxTurnCount,
          tokenCount / this.limits.maxTokenCount,
        ),
      ),
    };
  }

  /**
   * Write the notes that summarize the turns, on the model the caller names.
   *
   * The notes fold in the summary an earlier compaction wrote, so no compaction loses what the one before
   * it kept. The notes carry no citation number, because each answer numbers its own results from 1 and a
   * number the notes carried in would point at a chunk the new answer never retrieved.
   */
  private async summarize(
    priorSummary: string,
    summarizedTurns: readonly ChatMessage[][],
    modelId: string,
  ): Promise<string> {
    const earlierNotes: OpenAI.Responses.ResponseInputItem[] =
      priorSummary === "" ? [] : [{ role: "user", content: `Earlier notes:\n\n${priorSummary}` }];
    const response = await this.client.responses.create({
      model: modelId,
      instructions: [
        "You summarize the older part of a conversation between a person and an assistant that answers from stored documents.",
        "Write notes that let the assistant continue the conversation after the turns you read are gone.",
        "A first message headed 'Earlier notes:' holds the notes of an earlier compaction. Fold every fact in it into your notes.",
        "Keep what the person wants, every fact an answer established, every document title and heading an answer cited, every decision, and every question still open.",
        "Copy each name, identifier, number, date and quoted phrase exactly as it appears.",
        "Never copy a bracketed number such as [2]. Those numbers belong to answers that are gone. Name the document title instead.",
        "Drop greetings, the wording of the answers, and any text that repeats.",
        "Write short statements under these four headings: Goal, Facts, Documents, Open questions.",
        "Write no more than 400 words.",
        "Never answer the conversation. Write the notes and nothing else.",
      ].join("\n"),
      input: [
        ...earlierNotes,
        ...summarizedTurns.flat().map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: "Write the notes now." },
      ],
      store: false,
      truncation: "auto",
    });

    return response.output_text.trim();
  }

  /**
   * Summarize the oldest turns into notes, and report the messages the answer runs on.
   *
   * The result is null when the conversation does not compact: no turn can go, because the newest turns
   * alone fill the budget; or the model call failed; or the model wrote no notes. The answer then runs on
   * the whole conversation, and `truncation: "auto"` on the request drops the oldest items if the model
   * context cannot hold it. A null result never drops a turn, because notes that are absent or empty would
   * take the compacted turns with them.
   *
   * The caller must send `summary` and `compactedTurnCount` to the browser. The browser holds the
   * conversation, so a compaction the browser never records runs again on the next question.
   */
  async compact(
    summary: string,
    messages: readonly ChatMessage[],
    modelId: string,
  ): Promise<{ summary: string; messages: ChatMessage[]; compactedTurnCount: number } | null> {
    const turns = this.splitTurns(messages);
    const keptTurnCount = Math.max(
      this.limits.minKeptTurnCount,
      Math.ceil(turns.length * this.limits.keptTurnFraction),
    );
    if (turns.length <= keptTurnCount) {
      return null;
    }

    const compactedTurnCount = turns.length - keptTurnCount;
    let notes = "";
    try {
      notes = await this.summarize(summary, turns.slice(0, compactedTurnCount), modelId);
    } catch (error) {
      Logger.warn(`The conversation could not compact: ${String(error)}`, CompactionService.name);
    }
    if (notes === "") {
      return null;
    }

    return {
      summary: notes,
      messages: turns.slice(compactedTurnCount).flat(),
      compactedTurnCount,
    };
  }
}
