/** Parse a request body into a plain record (assertion-free; never throws). */
export function recordFrom(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  return recordFrom(await req.json().catch(() => null));
}
