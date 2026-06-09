// Exponential-backoff retry + per-session circuit breaker.
// Used to wrap tool calls so transient failures (rate limits, network) self-heal,
// and so a chronically broken tool is skipped within a session.

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseMs?: number; shouldRetry?: (err: unknown) => boolean } = {}
): Promise<T> {
  const { maxRetries = 3, baseMs = 600 } = opts;
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (opts.shouldRetry && !opts.shouldRetry(e)) throw e;
      if (i === maxRetries - 1) break;
      const delay = Math.pow(2, i) * baseMs + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Circuit breaker — per-session, in-memory.
type CircuitState = { failures: number; openedAt: number | null };
const circuits = new Map<string, CircuitState>();
const THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function key(sessionId: string, tool: string) { return `${sessionId}::${tool}`; }

export function isCircuitOpen(sessionId: string, tool: string): boolean {
  const k = key(sessionId, tool);
  const c = circuits.get(k);
  if (!c || c.openedAt === null) return false;
  if (Date.now() - c.openedAt > COOLDOWN_MS) {
    circuits.set(k, { failures: 0, openedAt: null });
    return false;
  }
  return true;
}

export function recordSuccess(sessionId: string, tool: string) {
  circuits.set(key(sessionId, tool), { failures: 0, openedAt: null });
}

export function recordFailure(sessionId: string, tool: string): { open: boolean } {
  const k = key(sessionId, tool);
  const c = circuits.get(k) ?? { failures: 0, openedAt: null };
  c.failures += 1;
  if (c.failures >= THRESHOLD && c.openedAt === null) c.openedAt = Date.now();
  circuits.set(k, c);
  return { open: c.openedAt !== null };
}

export function getCircuitSnapshot(): { tool: string; sessionId: string; failures: number; open: boolean }[] {
  return [...circuits.entries()].map(([k, v]) => {
    const [sessionId, tool] = k.split("::");
    return { sessionId, tool, failures: v.failures, open: v.openedAt !== null };
  });
}
