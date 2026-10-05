/** Classify a fetch/abort failure for SourceReport status. */
export function failureKind(err: unknown): 'timeout' | 'error' {
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  return 'error';
}

/**
 * GET JSON with a hard per-request timeout. Returns parsed JSON or throws.
 * Uses the Node 20 global fetch + AbortSignal.timeout — no extra deps.
 */
export async function getJson(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}
