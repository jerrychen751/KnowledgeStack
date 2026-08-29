import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

import type {
  ChatAnswerEvent,
  ChatMessage,
} from "@knowledgestack/shared/chat";
import { AppConfig } from "../config/app-config.js";
import { ToolRegistry } from "../tools/tool.registry.js";
import { ToolSession } from "../tools/tool.session.js";
import { CompactionService } from "./compaction.service.js";

@Injectable()
export class ChatService {
  /**
   * The models the answer can run on, cheapest first. The first entry answers a request that names none.
   *
   * These are the three tiers of the GPT-5.6 family, released 2026-06-23. Each one is the best value at its
   * tier: on 2026-08-12 luna costs 0.20 and 1.20 US dollars per million input and output tokens, terra costs
   * 2.00 and 12.00, and sol costs 5.00 and 30.00. No earlier model earns a place, because gpt-5.5 costs what
   * sol costs and reasons worse, and gpt-5.4-mini costs more than luna and reasons worse.
   */
  readonly models: readonly string[] = [
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
  ];

  private readonly client: OpenAI;

  constructor(
    appConfig: AppConfig,
    private readonly toolRegistry: ToolRegistry,
    private readonly compactionService: CompactionService,
  ) {
    this.client = new OpenAI({ apiKey: appConfig.openaiApiKey, maxRetries: 2 });
  }

  /**
   * Read the arguments of one tool call, or the text the model must read when the call cannot run.
   *
   * Every fault the model itself can make returns a correction. The caller sends that text back as the
   * output of the call, and the model chooses again inside the same answer. A correction never ends the
   * answer, because the model wrote the fault and can write a better call.
   */
  private readToolCall(
    toolCall: OpenAI.Responses.ResponseFunctionToolCall,
  ): { args: Record<string, unknown> } | { correction: string } {
    if (!this.toolRegistry.hasTool(toolCall.name)) {
      return {
        correction: `No tool is named ${toolCall.name}. Call one of ${this.toolRegistry.toolNames.join(", ")}.`,
      };
    }

    let parsedArguments: unknown;
    try {
      parsedArguments = JSON.parse(toolCall.arguments);
    } catch {
      return {
        correction: `The arguments of ${toolCall.name} are not JSON. Send one JSON object.`,
      };
    }
    // "null", "7" and "[]" all parse, and every tool reads its arguments by name.
    if (
      typeof parsedArguments !== "object" ||
      parsedArguments === null ||
      Array.isArray(parsedArguments)
    ) {
      return {
        correction: `The arguments of ${toolCall.name} must be one JSON object, such as {"query": "renewal terms"}.`,
      };
    }

    return { args: parsedArguments as Record<string, unknown> };
  }

  /**
   * Answer the last user message from the stored documents, and report every step as it happens.
   *
   * The generator yields a tool event before each call, a citations event once the chunks arrive, and
   * a delta event for every piece of answer text. The caller writes each event to the client as it arrives.
   * The model decides how often to search, and one answer runs at most 50 model calls.
   *
   * A conversation that reaches either compaction limit compacts before the answer starts, on the cheapest
   * model whatever tier the question chose, because the notes are mechanical work. The generator then yields
   * a compaction event with the notes that summarize the oldest turns, and a context event with the size the
   * next question starts from. The browser holds the conversation, so it must record both.
   *
   * The call goes to /v1/responses, because /v1/chat/completions rejects a function tool for every GPT-5.6
   * model unless the request turns reasoning off. `store: false` keeps the conversation off the OpenAI
   * account, so each round sends back every item of the round before it, and the encrypted reasoning in
   * those items is what carries the chain of thought from one round to the next.
   */
  async *streamAnswer(
    workspaceId: string,
    messages: readonly ChatMessage[],
    modelId: string,
    requestSummary: string,
  ): AsyncGenerator<ChatAnswerEvent> {
    let summary = requestSummary;
    let conversation = messages;
    if (this.compactionService.measureUsage(summary, conversation).fraction >= 1) {
      const compacted = await this.compactionService.compact(summary, conversation, this.models[0]);
      if (compacted !== null) {
        summary = compacted.summary;
        conversation = compacted.messages;
        yield {
          type: "compaction",
          summary,
          compactedTurnCount: compacted.compactedTurnCount,
        };
        yield {
          type: "context",
          usage: this.compactionService.measureUsage(summary, conversation),
        };
      }
    }

    // Input contains latest user message with all context from prior turns
    const input: OpenAI.Responses.ResponseInputItem[] = conversation.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    if (summary !== "") {
      input.unshift({
        role: "developer",
        content: [
          "Notes on the earlier turns of this conversation, which a compaction summarized.",
          "Treat the notes as what you already found. Search again before you state anything new.",
          "The notes carry no result number. Write only the numbers of the results you search for now.",
          "",
          summary,
        ].join("\n"),
      });
    }
    const session = new ToolSession(workspaceId);
    let answerText = "";
    let isAnswered = false;

    // Limit to 50 model turns max per user message
    for (let modelCallCount = 0; modelCallCount < 50; modelCallCount += 1) {
      // OpenAI returns a response which is a stream of events
      const response = await this.client.responses.create({
        model: modelId,
        include: ["reasoning.encrypted_content"],
        input,
        instructions: [
          "You answer questions about the documents of one workspace.",
          "Call search_documents before you answer. Search again with other words when the first results miss the question.",
          "Answer only from the search results. Never use knowledge from outside them.",
          "Every result carries a number. Write that number in brackets, such as [2], after each sentence that uses the result.",
          "Cite only the results you used. Never invent a number.",
          "Say that the workspace documents do not cover the question when the results do not answer it.",
          "Write plain sentences. Keep the answer under 150 words unless the question needs more.",
        ].join("\n"),
        store: false,
        stream: true,
        tools: this.toolRegistry.functionTools,
        truncation: "auto",
      });

      // Build reply text and tool call list if needed
      const toolCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
      for await (const event of response) {
        if (event.type === "response.output_text.delta") {
          answerText += event.delta;
          yield { type: "delta", text: event.delta };
        } else if (
          event.type === "response.output_item.done" &&
          // The request declares function tools and no hosted tool, so no other item type can arrive.
          (event.item.type === "message" ||
            event.item.type === "reasoning" ||
            event.item.type === "function_call")
        ) {
          input.push(event.item);
          if (event.item.type === "function_call") {
            toolCalls.push(event.item);
          }
        }
      }

      // At this point if no further tool calls are required client has received text and we can break out of model call loop
      if (toolCalls.length === 0) {
        isAnswered = true;
        break;
      }

      // TODO: in the future consider adding parallel tool call capabilities
      for (const toolCall of toolCalls) {
        const call = this.readToolCall(toolCall);
        if ("correction" in call) {
          yield { type: "tool", action: "rejected", detail: toolCall.name };
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: call.correction,
          });
          continue;
        }

        yield { type: "tool", ...this.toolRegistry.describeCall(toolCall.name, call.args) };
        const output = await this.toolRegistry.runTool(session, toolCall.name, call.args);
        yield* session.drainEvents();
        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output,
        });
      }
    }

    if (!isAnswered) {
      const text = `${answerText === "" ? "" : "\n\n"}The search did not settle after 50 model calls. Ask the question with fewer parts.`;
      answerText += text;
      yield { type: "delta", text };
    }

    yield {
      type: "context",
      usage: this.compactionService.measureUsage(summary, [
        ...conversation,
        { role: "assistant", content: answerText },
      ]),
    };
  }
}
