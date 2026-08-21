import { Injectable } from "@nestjs/common";
import "dotenv/config";
import OpenAI from "openai";

import type {
  ChatAnswerEvent,
  ChatMessage,
  Citation,
} from "@knowledgestack/shared/chat";

import { ToolRegistry } from "../tools/tool.registry.js";

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

  constructor(private readonly toolRegistry: ToolRegistry) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set in the environment");
    }

    this.client = new OpenAI({ apiKey, maxRetries: 2 });
  }

  /**
   * Answer the last user message from the stored documents, and report every step as it happens.
   *
   * The generator yields a tool event before each call, a citations event once the chunks arrive, and
   * a delta event for every piece of answer text. The caller writes each event to the client as it arrives.
   * The model decides how often to search, up to three rounds; the fourth round would cost more than it
   * returns on a corpus this size.
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
  ): AsyncGenerator<ChatAnswerEvent> {
    // 
    const input: OpenAI.Responses.ResponseInputItem[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const citationsByChunkId = new Map<string, Citation>();

    for (let round = 0; round < 3; round += 1) {
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

      const toolCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
      for await (const event of response) {
        if (event.type === "response.output_text.delta") {
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

      if (toolCalls.length === 0) {
        return;
      }

      for (const toolCall of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          const parsedArguments = JSON.parse(toolCall.arguments) as unknown;
          // "null", "7" and "[]" all parse, and every tool reads its arguments by name.
          if (
            typeof parsedArguments === "object" &&
            parsedArguments !== null &&
            !Array.isArray(parsedArguments)
          ) {
            args = parsedArguments as Record<string, unknown>;
          }
        } catch {
          args = {};
        }

        if (!this.toolRegistry.toolNames.includes(toolCall.name)) {
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: `No tool is named ${toolCall.name}. Call one of ${this.toolRegistry.toolNames.join(", ")}.`,
          });
          continue;
        }

        yield { type: "tool", ...this.toolRegistry.describeCall(toolCall.name, args) };
        const result = await this.toolRegistry.runTool(toolCall.name, workspaceId, args);
        if ("text" in result) {
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: result.text,
          });
          continue;
        }

        const roundCitations = result.citations.map((found) => {
          // A second search often returns a chunk the first one already numbered; that chunk keeps its number.
          const citation = citationsByChunkId.get(found.chunkId) ?? {
            index: citationsByChunkId.size + 1,
            chunkId: found.chunkId,
            externalTitle: found.externalTitle,
            externalUrl: found.externalUrl,
            provider: found.provider,
            headingPath: found.headingPath,
            text: found.text,
            score: found.score,
          };
          citationsByChunkId.set(found.chunkId, citation);
          return citation;
        });

        yield { type: "citations", citations: roundCitations };
        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output:
            roundCitations.length === 0
              ? "No document matched the query."
              : roundCitations
                  .map(
                    (citation) =>
                      `[${citation.index}] ${[citation.externalTitle, ...citation.headingPath].join(" > ")}\n${citation.text}`,
                  )
                  .join("\n\n"),
        });
      }
    }

    yield {
      type: "delta",
      text: "The search did not settle after three rounds. Ask the question with fewer parts.",
    };
  }
}
