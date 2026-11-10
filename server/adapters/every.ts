// Data that changes slowly (play history, library counts) rides along with
// a fast poll but is fetched at most every few minutes. A failure keeps the
// last good answer and tries again next time.

export function every<T>(ms: number, load: () => Promise<T>): () => Promise<T | undefined> {
  let at = 0;
  let last: T | undefined;
  return async () => {
    if (Date.now() - at < ms) return last;
    try {
      last = await load();
      at = Date.now();
    } catch {
      at = Date.now() - ms / 2; // try again in half the time
    }
    return last;
  };
}

/**
 * A good answer is kept for `ms`; a failure is the poll's failure. For data
 * the integration can't work without, where a wrong route must show rather
 * than hide behind an old answer.
 */
export function cached<T>(ms: number, load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let last: { value: T } | undefined;
  return async () => {
    if (last && Date.now() - at < ms) return last.value;
    last = { value: await load() };
    at = Date.now();
    return last.value;
  };
}
