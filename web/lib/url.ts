// A choice kept in the URL (?key=value), so a sort or view survives a reload,
// the back button and a shared link. The default value keeps the URL clean.

import { useSearchParams } from 'react-router-dom';

export function useUrlChoice<T extends string>(key: string, options: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw && (options as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = (v: T) => {
    const next = new URLSearchParams(params);
    if (v === fallback) next.delete(key);
    else next.set(key, v);
    setParams(next, { replace: true });
  };
  return [value, set];
}
