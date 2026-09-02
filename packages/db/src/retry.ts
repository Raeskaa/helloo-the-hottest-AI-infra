/**
 * Neon's free-tier compute suspends when idle; the first request(s) after a wake can fail with
 * a transient "internal error; reference = …" (HTTP 500) or a connection error. These helpers
 * retry with backoff so a cold start self-heals instead of surfacing to the caller.
 */

const TRANSIENT =
  /internal error|fetch failed|connect timeout|ECONNRESET|ETIMEDOUT|socket hang up|terminating connection|Connection terminated|Error connecting to database/i;

export function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT.test(msg);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number): number => Math.min(500 * 2 ** attempt, 4000);

/** Run `fn`, retrying transient DB failures with exponential backoff.
 *  Default budget (~11s over 5 tries) comfortably covers a free-tier compute cold-start. */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientDbError(err)) {
        await sleep(backoff(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("withDbRetry: exhausted");
}

/** A `fetch` for the neon-http driver that retries 5xx and network errors (cold starts). */
export function makeRetryingFetch(retries = 5): typeof fetch {
  return async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(input, init);
        if (res.status >= 500 && attempt < retries) {
          await sleep(backoff(attempt));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("makeRetryingFetch: exhausted");
  };
}
