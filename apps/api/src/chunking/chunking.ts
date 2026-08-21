import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { AlignType, Node, PhrasingContent, RootContent, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

import { formatMarkdownCodeBlock } from "../connectors/connector.markdown.js";
import type { DocumentBody } from "../connectors/connector.types.js";
import { countTokens } from "../embedding/embedding.model.js";

type Chunk = {
  text: string;
  tokenCount: number;
  // Ordered Markdown headings above this chunk, outermost first; empty when the chunk came from plain text
  headingPath: readonly string[];
};

type ChunkOptions = {
  maxTokens: number;
  minTokens: number;
};

/**
 * Cut text at the last paragraph, line, sentence, or word boundary that fits the ceiling.
 *
 * The splitter sums the token count of each piece it cuts, instead of counting the joined text, so
 * a returned piece can hold fewer tokens than maxTokens but never more.
 */
async function splitText(text: string, maxTokens: number): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxTokens,
    // No piece repeats text from the piece before it, so a chunk holds every token exactly once.
    chunkOverlap: 0,
    lengthFunction: countTokens,
  });

  return splitter.splitText(text);
}

/** Cut plain text into chunks. Plain text carries no structure, so every heading path is empty. */
async function chunkText(
  text: string,
  options: ChunkOptions,
): Promise<Chunk[]> {
  const pieces = await splitText(text, options.maxTokens);

  return pieces.map((piece) => ({
    text: piece,
    tokenCount: countTokens(piece),
    headingPath: [],
  }));
}

// fromMarkdown sets a position with offsets on every node it parses. Only a synthesized node lacks one.
function readNodeSource(node: Node, source: string): string {
  return source.slice(node.position!.start.offset!, node.position!.end.offset!);
}

function readPhrasingText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if ("value" in node) {
        return node.value;
      }
      if ("children" in node) {
        return readPhrasingText(node.children);
      }
      return "";
    })
    .join("");
}

// The delimiter row is not a node; mdast encodes the column alignment on the table instead.
function formatTableDelimiterRow(table: Table): string {
  const align: readonly AlignType[] = table.align ?? [];
  const cells = table.children[0].children.map((_cell, columnIndex) => {
    switch (align[columnIndex]) {
      case "left":
        return ":---";
      case "center":
        return ":---:";
      case "right":
        return "---:";
      default:
        return "---";
    }
  });

  return `| ${cells.join(" | ")} |`;
}

/**
 * Group line-separated source units into pieces under the token ceiling, repeating a header on each.
 * A unit that exceeds the ceiling by itself is emitted whole: a cut inside a table row or a list item
 * produces broken Markdown, and the embedding limit of 8191 tokens sits far above the chunk ceiling.
 */
function packSourceUnits(
  units: readonly string[],
  header: string,
  maxTokens: number,
): string[] {
  const headerTokens = header === "" ? 0 : countTokens(header);
  const pieces: string[] = [];
  let pending: string[] = [];
  let pendingTokens = headerTokens;

  for (const unit of units) {
    if (pending.length > 0 && pendingTokens + countTokens(unit) > maxTokens) {
      pieces.push([header, ...pending].filter((part) => part !== "").join("\n"));
      pending = [];
      pendingTokens = headerTokens;
    }
    pending.push(unit);
    pendingTokens += countTokens(unit);
  }

  if (pending.length > 0) {
    pieces.push([header, ...pending].filter((part) => part !== "").join("\n"));
  }

  return pieces;
}

async function splitOversizeNode(
  node: RootContent,
  source: string,
  maxTokens: number,
): Promise<string[]> {
  if (node.type === "code") {
    const language = node.lang ?? "";
    // Every piece is re-fenced, so the fence and the language must come out of each piece's budget.
    const fenceTokens = countTokens(formatMarkdownCodeBlock("", language));
    const pieces = await splitText(node.value, maxTokens - fenceTokens);
    return pieces.map((piece) => formatMarkdownCodeBlock(piece, language));
  }

  if (node.type === "table") {
    const rows = node.children.map((row) => readNodeSource(row, source));
    const header = `${rows[0]}\n${formatTableDelimiterRow(node)}`;
    return packSourceUnits(rows.slice(1), header, maxTokens);
  }

  if (node.type === "list") {
    const items = node.children.map((item) => readNodeSource(item, source));
    return packSourceUnits(items, "", maxTokens);
  }

  return splitText(readNodeSource(node, source), maxTokens);
}

/**
 * Cut Markdown into one chunk per block node, each carrying the headings above it.
 * A heading becomes a chunk of its own and the last entry of its own heading path, so the packer
 * merges it with the text below it under the ordinary rules.
 */
async function chunkMarkdown(
  source: string,
  options: ChunkOptions,
): Promise<Chunk[]> {
  const root = fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  const chunks: Chunk[] = [];
  const headingStack: { depth: number; text: string }[] = [];

  for (const node of root.children) {
    if (node.type === "heading") {
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].depth >= node.depth
      ) {
        headingStack.pop();
      }
      headingStack.push({
        depth: node.depth,
        text: readPhrasingText(node.children),
      });
    }

    const headingPath = headingStack.map((heading) => heading.text);
    const text = readNodeSource(node, source);
    const tokenCount = countTokens(text);
    if (tokenCount <= options.maxTokens) {
      chunks.push({ text, tokenCount, headingPath });
      continue;
    }

    for (const piece of await splitOversizeNode(node, source, options.maxTokens)) {
      chunks.push({
        text: piece,
        tokenCount: countTokens(piece),
        headingPath,
      });
    }
  }

  return chunks;
}

function findCommonPrefixLength(
  left: readonly string[],
  right: readonly string[],
): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[length] === right[length]
  ) {
    length += 1;
  }

  return length;
}

// Only blocks under the very same heading merge. Merging two sections would collapse the merged heading path to their shared prefix, and that prefix is a worse retrieval key than either section.
function isSameSection(left: Chunk, right: Chunk): boolean {
  return (
    left.headingPath.length === right.headingPath.length &&
    findCommonPrefixLength(left.headingPath, right.headingPath) ===
      left.headingPath.length
  );
}

function joinChunks(chunks: readonly Chunk[]): Chunk {
  if (chunks.length === 1) {
    return chunks[0];
  }

  let headingPath = chunks[0].headingPath;
  for (const chunk of chunks) {
    headingPath = headingPath.slice(
      0,
      findCommonPrefixLength(headingPath, chunk.headingPath),
    );
  }

  // Every chunk here is a top-level Markdown block, which a blank line separates from the next.
  const text = chunks.map((chunk) => chunk.text).join("\n\n");
  return { text, tokenCount: countTokens(text), headingPath };
}

/**
 * Merge as many leading chunks as fit, and return the rest untouched. The caller packs by the sum of the
 * incoming counts, which is an estimate: a token can span the join between two chunks, so the exact count
 * of the merged text can differ. This drops the last member until the exact count fits.
 */
function mergeLeadingChunks(
  chunks: readonly Chunk[],
  maxTokens: number,
): { merged: Chunk; rest: readonly Chunk[] } {
  for (let memberCount = chunks.length; memberCount > 1; memberCount -= 1) {
    const merged = joinChunks(chunks.slice(0, memberCount));
    if (merged.tokenCount <= maxTokens) {
      return { merged, rest: chunks.slice(memberCount) };
    }
  }

  return { merged: chunks[0], rest: chunks.slice(1) };
}

/**
 * Merge neighbouring chunks up to the token ceiling. The packer keeps the chunk order and drops no text.
 *
 * It grows one run of chunks at a time. A chunk joins the run while it shares the heading path of the run
 * and the running total stays at or under maxTokens, and any other chunk closes the run and starts the
 * next one. That total is an estimate, because a token can span the join between two chunks, so the
 * packer recounts the merged text and drops the last member until the exact count fits. Two sections
 * never merge, because the merged heading path would collapse to their shared prefix, and that prefix is
 * a worse retrieval key than either section.
 *
 * A chunk can end below minTokens when it is a whole section, which is a complete thought rather than a
 * fragment. Only a trailing chunk under minTokens merges back, and only into a previous chunk of the same
 * section. The packer never splits, so a chunk that arrives above maxTokens passes through unchanged.
 */
function packChunks(
  chunks: readonly Chunk[],
  options: ChunkOptions,
): Chunk[] {
  const packed: Chunk[] = [];
  let pending: Chunk[] = [];
  let estimatedTokens = 0;

  for (const chunk of chunks) {
    const fits =
      estimatedTokens + chunk.tokenCount <= options.maxTokens &&
      isSameSection(pending[0] ?? chunk, chunk);
    if (pending.length > 0 && !fits) {
      let remaining: readonly Chunk[] = pending;
      while (remaining.length > 0) {
        const { merged, rest } = mergeLeadingChunks(
          remaining,
          options.maxTokens,
        );
        packed.push(merged);
        remaining = rest;
      }
      pending = [];
      estimatedTokens = 0;
    }

    pending.push(chunk);
    estimatedTokens += chunk.tokenCount;
  }

  let remaining: readonly Chunk[] = pending;
  while (remaining.length > 0) {
    const { merged, rest } = mergeLeadingChunks(remaining, options.maxTokens);
    packed.push(merged);
    remaining = rest;
  }

  // A short section is a complete thought, not a fragment, so only a same-section tail merges back.
  // On the plain-text path every heading path is empty, so this always catches a trailing fragment.
  const last = packed.at(-1);
  const previous = packed.at(-2);
  if (
    last !== undefined &&
    previous !== undefined &&
    last.tokenCount < options.minTokens &&
    isSameSection(previous, last)
  ) {
    const merged = joinChunks([previous, last]);
    if (merged.tokenCount <= options.maxTokens) {
      packed.splice(-2, 2, merged);
    }
  }

  return packed;
}

/**
 * Cut one fetched document body into the chunks that get embedded and stored.
 * The caller prepends the title path and the heading path before it embeds; the text stays raw here.
 */
export async function createChunks(
  body: DocumentBody,
  options?: Partial<ChunkOptions>,
): Promise<Chunk[]> {
  const resolvedOptions: ChunkOptions = {
    maxTokens: 512,
    minTokens: 64,
    ...options,
  };

  const chunks =
    body.textFormat === "markdown"
      ? await chunkMarkdown(body.text, resolvedOptions)
      : await chunkText(body.text, resolvedOptions);

  return packChunks(chunks, resolvedOptions);
}
