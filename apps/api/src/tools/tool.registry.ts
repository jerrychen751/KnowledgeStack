import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import type OpenAI from "openai";

import { ToolSession } from "./tool.session.js";

/**
 * The declaration a tool method carries.
 *
 * The model reads `name`, `description` and `parameters`, and `parameters` is a JSON Schema object such as
 * `{ type: "object", properties: { query: { type: "string" } }, required: ["query"] }`. The browser shows
 * the tool display text from `buildDisplayText` while the call runs, such as "searched pension rules".
 */
type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  buildDisplayText(args: Record<string, unknown>): string;
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
 * AgentLoop sends `functionTools` with each request and calls `run` with the name the model chose.
 * An MCP server reports the same declarations and reaches the same methods.
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  readonly functionTools: OpenAI.Responses.FunctionTool[] = [];

  private readonly byName = new Map<string, RegisteredTool>();

  /** Every tool name the model may call, in registration order. */
  get names(): string[] {
    return [...this.byName.keys()];
  }

  /** Every tool declaration, in registration order. */
  get definitions(): ToolDefinition[] {
    return [...this.byName.values()].map((tool) => tool.definition);
  }

  /** Whether a method declares this tool. The model can name a tool that no method declares. */
  has(name: string): boolean {
    return this.byName.has(name);
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
        if (this.byName.has(definition.name)) {
          throw new Error(`Two methods declare the tool ${definition.name}.`);
        }

        const method = instance[methodName] as RegisteredTool["run"];
        this.byName.set(definition.name, { definition, run: method.bind(instance) });
        this.functionTools.push({
          type: "function",
          name: definition.name,
          description: definition.description,
          strict: true,
          parameters: definition.parameters,
        });
      }
    }

    Logger.log(`Registered tools: ${this.names.join(", ")}`, ToolRegistry.name);
  }

  /**
   * Build the tool display text the browser shows while one call runs. Call `has` first.
   *
   * A callback fault returns a readable tool name. A fault in the tool display text must not stop the answer.
   */
  buildDisplayText(name: string, args: Record<string, unknown>): string {
    const { definition } = this.read(name);
    try {
      return definition.buildDisplayText(args);
    } catch (error) {
      Logger.warn(
        `The tool ${name} could not build its display text: ${String(error)}`,
        ToolRegistry.name,
      );
    }

    return name.replaceAll("_", " ");
  }

  /**
   * Run one call and return the text the model reads back. The name must be one the model read from
   * functionTools. A tool that draws something beside the answer emits its frames on the session, so the
   * caller must drain the session after this call returns.
   */
  async run(
    session: ToolSession,
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    return this.read(name).run(session, args);
  }

  private read(name: string): RegisteredTool {
    const tool = this.byName.get(name);
    if (tool === undefined) {
      throw new Error(`No method declares the tool ${name}.`);
    }

    return tool;
  }
}
