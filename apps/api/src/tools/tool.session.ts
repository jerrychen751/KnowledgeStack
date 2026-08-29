import type { ChatAnswerEvent, Citation } from "@knowledgestack/shared/chat";

/**
 * The state that every tool call of one answer shares.
 *
 * The caller builds one session per answer, passes it to each `ToolRegistry.run` call, and drains the
 * frames after each call returns. A caller that draws nothing, such as the MCP server, drops the frames and
 * keeps only the text the tool returns.
 */
export class ToolSession {
  private readonly citationsByChunkId = new Map<string, Citation>();
  private readonly events: ChatAnswerEvent[] = [];

  constructor(readonly workspaceId: string) {}

  /**
   * Give one retrieved chunk its number for this answer.
   *
   * A second search often returns a chunk that an earlier search already numbered; that chunk keeps its
   * number, because the answer text already cites it as `[index]`.
   */
  cite(chunk: Omit<Citation, "index">): Citation {
    const held = this.citationsByChunkId.get(chunk.chunkId);
    if (held !== undefined) {
      return held;
    }

    const citation = { ...chunk, index: this.citationsByChunkId.size + 1 };
    this.citationsByChunkId.set(chunk.chunkId, citation);
    return citation;
  }

  /** Report one frame for the browser to draw beside the answer. */
  emit(event: ChatAnswerEvent): void {
    this.events.push(event);
  }

  /** Take every frame emitted since the last call, in order, and leave the session empty. */
  drainEvents(): ChatAnswerEvent[] {
    return this.events.splice(0);
  }
}
