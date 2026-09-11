import type { AppEnv } from "@helloo/core";

/**
 * Web search via Tavily (an LLM-native search API — HTTP only, so it runs on Workers). Returns a
 * short synthesised answer plus source results. Enabled for the agent only when TAVILY_API_KEY is
 * set. This is the read primitive behind "what's the latest on X" and the daily-brief.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}
export interface WebSearchResponse {
  answer: string | null;
  results: WebSearchResult[];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toResults(v: unknown): WebSearchResult[] {
  if (!Array.isArray(v)) return [];
  const out: WebSearchResult[] = [];
  for (const item of v) {
    if (item === null || typeof item !== "object") continue;
    const url = "url" in item ? asString(item.url) : "";
    if (!url) continue;
    const title = "title" in item ? asString(item.title) : "";
    const content = "content" in item ? asString(item.content) : "";
    out.push({ title, url, content });
  }
  return out;
}

/** Search the web. Throws if the key is missing or Tavily errors. */
export async function webSearch(env: AppEnv, query: string, maxResults = 5): Promise<WebSearchResponse> {
  const key = env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: Math.min(Math.max(maxResults, 1), 10),
    }),
  });
  if (!res.ok) throw new Error(`web search failed: ${res.status} ${await res.text()}`);
  const data: unknown = await res.json();
  const answer =
    data !== null && typeof data === "object" && "answer" in data ? asString(data.answer) : "";
  const results =
    data !== null && typeof data === "object" && "results" in data ? toResults(data.results) : [];
  return { answer: answer.length > 0 ? answer : null, results };
}
