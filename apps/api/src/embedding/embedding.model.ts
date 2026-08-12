import { getEncoding, type Tiktoken } from "js-tiktoken";

/**
 * The embedding model and the values that must agree with it.
 *
 * `dimensions` must equal the width of `DocumentChunk.embedding` in `prisma/schema/document.prisma`.
 * A mismatch fails loudly: the service rejects the vector, and Postgres rejects the insert.
 *
 * `encoding` is the tokenizer this model uses. Chunking measures every chunk with it, so a mismatch
 * fails silently instead: counts drift by a few percent on identifiers and by more on other scripts.
 */
export const embeddingModel = {
  name: "text-embedding-3-small",
  dimensions: 1536,
  encoding: "cl100k_base",
  // /v1/embeddings rejects a request that breaks any of the three: one input over 8191 tokens, over 2048 inputs, or over 300000 tokens across the array.
  maxInputTokens: 8191,
  maxInputs: 2048,
  maxRequestTokens: 300000,
} as const;

let encoder: Tiktoken | undefined;

export function countTokens(text: string): number {
  encoder ??= getEncoding(embeddingModel.encoding);
  return encoder.encode(text).length;
}
