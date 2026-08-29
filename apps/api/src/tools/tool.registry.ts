import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import type OpenAI from "openai";

import { ToolSession } from "./tool.session.js";

/**
 * The declaration a tool method carries.
 *
 * The model reads `name`, `description` and `parameters`, and `parameters` is a JSON Schema object such as
 * `{ type: "object", properties: { query: { type: "string" } }, required: ["query"] }`. The browser shows
 * `action` and the result of `buildDetail` while the call runs, such as "searched" and "pension rules".
 */
type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  action: string;
  buildDetail(args: Record<string, unknown>): string;
};

/** Declare a method as a tool the chat agent may call. Its class must be a provider of a module the app imports, or ToolRegistry never finds the method. */
export const Tool = DiscoveryService.createDecorator<ToolDefinition>();

type RegisteredTool = {
  definition: ToolDefinition;
  run(session: ToolSession, args: Record<string, unknown>): Promise<string>;
};

/**
 * Every tool the chat agent may call, read once at startup from the @Tool methods of the providers.
 *
 * ChatService sends `functionTools` with each request and calls `runTool` with the name the model chose.
 * An MCP server reports the same declarations and reaches the same methods.
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  readonly functionTools: OpenAI.Responses.FunctionTool[] = [];

  private readonly toolsByName = new Map<string, RegisteredTool>();

  /** Every tool name the model may call, in registration order. */
  get toolNames(): string[] {
    return [...this.toolsByName.keys()];
  }

  /** Whether a method declares this tool. The model can name a tool that no method declares. */
  hasTool(name: string): boolean {
    return this.toolsByName.has(name);
  }

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    // Walk through each method of each provider registered in any active module of the running app to register all tools, which are methods annotated with @Tool decorator
    for (const wrapper of this.discoveryService.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | null | undefined;
      if (instance === null || typeof instance !== "object") {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance) as object | null;
      for (const methodName of this.metadataScanner.getAllMethodNames(prototype)) {
        const definition = this.discoveryService.getMetadataByDecorator(Tool, wrapper, methodName);
        if (definition === undefined) {
          continue;
        }
        if (this.toolsByName.has(definition.name)) {
          throw new Error(`Two methods declare the tool ${definition.name}.`);
        }

        const method = instance[methodName] as RegisteredTool["run"];
        this.toolsByName.set(definition.name, { definition, run: method.bind(instance) });
        this.functionTools.push({
          type: "function",
          name: definition.name,
          description: definition.description,
          strict: true,
          parameters: definition.parameters,
        });
      }
    }

    Logger.log(`Registered tools: ${this.toolNames.join(", ")}`, ToolRegistry.name);
  }

  /**
   * Report the words the browser shows while one call runs. Call hasTool first.
   *
   * A buildDetail that throws yields an empty detail. The detail is display text, so a fault in one tool
   * declaration must not end the answer of a person.
   */
  describeCall(name: string, args: Record<string, unknown>): { action: string; detail: string } {
    const { definition } = this.readTool(name);
    let detail = "";
    try {
      detail = definition.buildDetail(args);
    } catch (error) {
      Logger.warn(`The tool ${name} could not describe its call: ${String(error)}`, ToolRegistry.name);
    }

    return { action: definition.action, detail };
  }

  /**
   * Run one call and return the text the model reads back. The name must be one the model read from
   * functionTools. A tool that draws something beside the answer emits its frames on the session, so the
   * caller must drain the session after this call returns.
   */
  async runTool(
    session: ToolSession,
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    return this.readTool(name).run(session, args);
  }

  private readTool(name: string): RegisteredTool {
    const tool = this.toolsByName.get(name);
    if (tool === undefined) {
      throw new Error(`No method declares the tool ${name}.`);
    }

    return tool;
  }
}
