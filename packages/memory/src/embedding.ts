import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import type { AppEnv } from "@helloo/core";

/**
 * Recall index embeddings (ADR-0005). Provider-agnostic via the AI SDK. `gemini-embedding-001`
 * truncated to 768 dims (Matryoshka). Cosine is scale-invariant, so truncated vectors need no
 * renormalization. Document vs query task types improve retrieval alignment.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

function provider(env: AppEnv) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for embeddings");
  return createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
}

function googleOptions(taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  return { google: { outputDimensionality: EMBEDDING_DIMS, taskType } };
}

/** Embed facts for storage (RETRIEVAL_DOCUMENT). Order matches the input. */
export async function embedDocuments(env: AppEnv, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = provider(env).textEmbeddingModel(EMBEDDING_MODEL);
  const { embeddings } = await embedMany({
    model,
    values: texts,
    providerOptions: googleOptions("RETRIEVAL_DOCUMENT"),
  });
  return embeddings;
}

/** Embed a search query (RETRIEVAL_QUERY). */
export async function embedQuery(env: AppEnv, text: string): Promise<number[]> {
  const model = provider(env).textEmbeddingModel(EMBEDDING_MODEL);
  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: googleOptions("RETRIEVAL_QUERY"),
  });
  return embedding;
}
