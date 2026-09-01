import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { packageRoot } from "../../../knowledge/paths.js";

export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

export interface OpenAiEmbeddingProviderOptions {
  model?: string;
  apiKey?: string;
  endpoint?: string;
  maxBatchSize?: number;
  maxConcurrentRequests?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/embeddings";

export function resolveOpenAiApiKey(): string | undefined {
  const environmentKey = process.env.OPENAI_API_KEY?.trim();
  if (environmentKey) return environmentKey;

  const localEnvPath = resolve(packageRoot(), "local.env");
  if (!existsSync(localEnvPath)) return undefined;

  const contents = readFileSync(localEnvPath, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*?)\s*$/u);
    if (!match) continue;

    let value = match[1] ?? "";
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    value = value.trim();
    return value || undefined;
  }
  return undefined;
}

export function createOpenAiEmbeddingProvider(
  options: OpenAiEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const model = options.model ?? DEFAULT_MODEL;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const maxBatchSize = positiveInteger(options.maxBatchSize ?? 64, "maxBatchSize");
  const maxConcurrentRequests = positiveInteger(
    options.maxConcurrentRequests ?? 8,
    "maxConcurrentRequests",
  );
  const maxRetries = nonNegativeInteger(options.maxRetries ?? 5, "maxRetries");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    model,
    async embed(texts: readonly string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];

      const apiKey = options.apiKey === undefined
        ? resolveOpenAiApiKey()
        : options.apiKey.trim() || undefined;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
      const configuredApiKey = apiKey;

      const batches: Array<{ start: number; texts: readonly string[] }> = [];
      for (let start = 0; start < texts.length; start += maxBatchSize) {
        batches.push({ start, texts: texts.slice(start, start + maxBatchSize) });
      }

      const output = new Array<Float32Array>(texts.length);
      let nextBatch = 0;
      async function worker(): Promise<void> {
        while (nextBatch < batches.length) {
          const batch = batches[nextBatch++];
          if (!batch) return;
          const vectors = await requestBatch(batch.texts, configuredApiKey);
          if (vectors.length !== batch.texts.length) {
            throw new Error(
              `OpenAI embeddings response count mismatch: expected ${batch.texts.length}, received ${vectors.length}`,
            );
          }
          for (let index = 0; index < vectors.length; index += 1) {
            output[batch.start + index] = vectors[index]!;
          }
        }
      }

      async function requestBatch(batch: readonly string[], key: string): Promise<Float32Array[]> {
        for (let attempt = 0; ; attempt += 1) {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, input: batch, encoding_format: "float" }),
          });

          if (response.ok) {
            const payload = await response.json() as {
              data?: Array<{ embedding?: number[] }>;
            };
            if (!Array.isArray(payload.data)) {
              throw new Error("OpenAI embeddings response did not contain a data array");
            }
            return payload.data.map((entry) => {
              if (!Array.isArray(entry.embedding)) {
                throw new Error("OpenAI embeddings response contained an invalid embedding");
              }
              return new Float32Array(entry.embedding);
            });
          }

          const bodySnippet = (await response.text()).slice(0, 500).split(key).join("[REDACTED]");
          const retryable = response.status === 429 || response.status >= 500;
          if (!retryable || attempt >= maxRetries) {
            throw new Error(
              `OpenAI embeddings request failed with status ${response.status}: ${bodySnippet}`,
            );
          }
          await delay(retryDelayMs(attempt));
        }
      }

      const workerCount = Math.min(maxConcurrentRequests, batches.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      return output;
    },
  };
}

export function createFakeEmbeddingProvider(
  dim = 32,
  model = "fake-embedding",
): EmbeddingProvider {
  positiveInteger(dim, "dim");
  const encoder = new TextEncoder();

  return {
    model,
    async embed(texts: readonly string[]): Promise<Float32Array[]> {
      return texts.map((text) => fakeVector(encoder.encode(text), dim));
    },
  };
}

function fakeVector(bytes: Uint8Array, dim: number): Float32Array {
  const vector = new Float32Array(dim);
  let normSquared = 0;
  for (let dimension = 0; dimension < dim; dimension += 1) {
    let hash = (0x811c9dc5 ^ Math.imul(dimension + 1, 0x9e3779b1)) >>> 0;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    const value = hash / 0x7fffffff - 1;
    vector[dimension] = value;
    normSquared += value * value;
  }

  if (normSquared === 0) {
    vector[0] = 1;
    return vector;
  }
  const inverseNorm = 1 / Math.sqrt(normSquared);
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = vector[index]! * inverseNorm;
  }
  return vector;
}

function retryDelayMs(attempt: number): number {
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return base * (0.75 + Math.random() * 0.5);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}
