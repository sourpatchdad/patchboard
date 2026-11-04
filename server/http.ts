// fetch with a timeout and an error message that never contains the URL, since
// several integrations (Tautulli) carry their API key in the query string.

export class HttpError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`.trim());
    this.status = status;
  }
}

export async function request(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if ((err as Error).name === 'TimeoutError') throw new Error(`Timed out after ${timeoutMs / 1000}s`);
    throw new Error(cause ? `Unreachable (${cause})` : 'Unreachable');
  }
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  return res;
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const res = await request(url, init, timeoutMs);
  return (await res.json()) as T;
}
