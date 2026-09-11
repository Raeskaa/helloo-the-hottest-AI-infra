import { recall, findPeople } from "@helloo/memory";
import { webSearch } from "@helloo/integrations";
import type { AppEnv } from "@helloo/core";

/**
 * helloo as an MCP server (read-only v1). Exposes a small, SAFE surface — the user's memory, their
 * people graph, and web search — over MCP's JSON-RPC so any MCP client (Claude / ChatGPT / …) can
 * reach a specific user's helloo. The per-user token (in the endpoint path) is the credential;
 * writes/actions are intentionally NOT exposed here yet (they belong behind the trust gate).
 */

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "helloo", version: "1.0.0" };

type JsonRpcId = string | number | null;
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function readId(body: unknown): JsonRpcId {
  if (body !== null && typeof body === "object" && "id" in body) {
    const id = body.id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return null;
}
function readMethod(body: unknown): string {
  return body !== null && typeof body === "object" && "method" in body ? asString(body.method) : "";
}
function readParams(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && "params" in body) {
    const p = body.params;
    if (p !== null && typeof p === "object" && !Array.isArray(p)) return { ...p };
  }
  return {};
}

/** Tool definitions advertised to MCP clients (JSON Schema for inputs). */
function toolDefs(env: AppEnv): Array<{ name: string; description: string; inputSchema: unknown }> {
  const defs = [
    {
      name: "recall_memory",
      description: "Search what helloo remembers about the user (their owned, private memory).",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "What to look up" } },
        required: ["query"],
      },
    },
    {
      name: "find_person",
      description: "Look up a person the user knows by name/email/handle; returns their contact points.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "Name, email, or handle" } },
        required: ["name"],
      },
    },
  ];
  if (env.TAVILY_API_KEY) {
    defs.push({
      name: "web_search",
      description: "Search the live web; returns a short answer plus source links.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    });
  }
  return defs;
}

/** Run one exposed tool and return a plain-text result. */
async function callTool(
  env: AppEnv,
  ownerId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (name === "recall_memory") {
    const hits = await recall(env, ownerId, asString(args.query), 8);
    if (hits.length === 0) return "(nothing remembered for that)";
    return hits.map((h) => `- ${h.atom.factText}`).join("\n");
  }
  if (name === "find_person") {
    const people = await findPeople(env, ownerId, asString(args.name), 5);
    if (people.length === 0) return "(no matching person)";
    return people
      .map((p) => {
        const ids = p.identities.map((i) => `${i.channel}: ${i.value}`).join(", ");
        return `${p.displayName}${ids ? ` — ${ids}` : ""}`;
      })
      .join("\n");
  }
  if (name === "web_search") {
    if (!env.TAVILY_API_KEY) return "(web search not configured)";
    const r = await webSearch(env, asString(args.query), 5);
    const sources = r.results.map((s) => `- ${s.title}: ${s.url}`).join("\n");
    return `${r.answer ?? "(no direct answer)"}\n\nSources:\n${sources}`;
  }
  throw new Error(`unknown tool: ${name}`);
}

/**
 * Handle one JSON-RPC message. Returns a response object, or null for notifications (no reply).
 */
export async function handleMcpMessage(
  env: AppEnv,
  ownerId: string,
  body: unknown,
): Promise<JsonRpcResponse | null> {
  const id = readId(body);
  const method = readMethod(body);

  if (method === "initialize") {
    const params = readParams(body);
    const requested = asString(params.protocolVersion);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: requested.length > 0 ? requested : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method.startsWith("notifications/")) return null; // e.g. notifications/initialized — no reply
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: toolDefs(env) } };
  }
  if (method === "tools/call") {
    const params = readParams(body);
    const name = asString(params.name);
    const args = params.arguments !== null && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? { ...params.arguments }
      : {};
    try {
      const text = await callTool(env, ownerId, name, args);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "tool failed";
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}
