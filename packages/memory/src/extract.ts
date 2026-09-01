import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { AppEnv } from "@helloo/core";

/**
 * Fact extraction (ADR-0002 write path, step "extract"). Provider-agnostic via the AI SDK
 * so the model swaps (Gemini <-> Claude) without touching callers. Structured output is
 * schema-validated by the SDK — no hand-rolled JSON parsing.
 */

const extractionSchema = z.object({
  facts: z.array(
    z.object({
      subject: z.string().describe("who/what the fact is about, e.g. 'user' or a person's name"),
      predicate: z.string().describe("snake_case relation, e.g. lives_in, prefers, works_at"),
      value: z.string().describe("the object of the fact, as a short string"),
      factText: z.string().describe("a plain-language rendering of the fact"),
      confidence: z.number().min(0).max(1).describe("0-1: how durable/certain this fact is"),
    }),
  ),
});

export interface ExtractedFact {
  subject: string;
  predicate: string;
  value: string;
  factText: string;
  confidence: number;
}

const SYSTEM = `You extract durable, atomic facts worth remembering about the user from a message.
Keep only stable facts — identity, preferences, relationships, commitments, ongoing context.
Ignore transient chit-chat, questions, and one-off task instructions.
Return an empty list when nothing is worth remembering. Never invent facts not supported by the text.`;

/** The model used for extraction. Swap by changing this in one place (or to `gemini-flash-latest`). */
export const EXTRACTION_MODEL = "gemini-3.6-flash";

export async function extractFacts(env: AppEnv, text: string): Promise<ExtractedFact[]> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for the memory fact-pipeline");
  }
  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const { object } = await generateObject({
    model: google(EXTRACTION_MODEL),
    schema: extractionSchema,
    system: SYSTEM,
    prompt: text,
  });
  return object.facts;
}
