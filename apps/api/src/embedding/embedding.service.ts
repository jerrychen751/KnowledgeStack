import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

import { AppConfig } from "../config/app-config.js";

import { countTokens, embeddingModel } from "./embedding.model.js";

@Injectable()
export class EmbeddingService {
  private readonly client: OpenAI;

  constructor(appConfig: AppConfig) {
    this.client = new OpenAI({
      apiKey: appConfig.openaiApiKey,
      // The SDK retries 429 and 5xx with backoff. Two is its default, and a first sync issues many calls.
      maxRetries: 4,
    });
  }

  private async embed(texts: readonly string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: embeddingModel.name,
      dimensions: embeddingModel.dimensions,
      input: [...texts],
    });

    if (response.data.length !== texts.length) {
      throw new Error(
        `OpenAI returned ${response.data.length} vectors for ${texts.length} inputs.`,
      );
    }

    const vectors: number[][] = new Array(texts.length);
    for (const item of response.data) {
      if (item.embedding.length !== embeddingModel.dimensions) {
        throw new Error(
          `OpenAI returned a vector of ${item.embedding.length} dimensions; the column holds ${embeddingModel.dimensions}.`,
        );
      }
      // Each item names the input it belongs to, so read that index instead of trusting the array order.
      vectors[item.index] = item.embedding;
    }

    return vectors;
  }

  /**
   * Embed the text of every chunk of one document. The returned vectors match the order of the input.
   * The caller prepends the title path and the heading path; this method embeds the strings as given.
   */
  async embedChunks(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    let batch: string[] = [];
    let batchTokens = 0;

    for (const text of texts) {
      const tokens = countTokens(text);
      if (tokens > embeddingModel.maxInputTokens) {
        throw new Error(
          `A chunk of ${tokens} tokens exceeds the model input limit of ${embeddingModel.maxInputTokens}.`,
        );
      }
      if (
        batch.length > 0 &&
        (batchTokens + tokens > embeddingModel.maxRequestTokens ||
          batch.length === embeddingModel.maxInputs)
      ) {
        vectors.push(...(await this.embed(batch)));
        batch = [];
        batchTokens = 0;
      }
      batch.push(text);
      batchTokens += tokens;
    }

    if (batch.length > 0) {
      vectors.push(...(await this.embed(batch)));
    }

    return vectors;
  }

  /** Embed one search query. A query carries no title path and no heading path, unlike a stored chunk. */
  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    return vector;
  }
}
