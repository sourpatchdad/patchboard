// Live numbers for apps set up in Edit apps, fetched once a minute and shared
// by every tile and jack on the page (one request, however many tiles).

import { useEffect, useState } from 'react';
import type { JsonField } from '../../shared/jsonwidget.ts';
import { toneFor } from '../../shared/jsonwidget.ts';
import { formatValue } from '../board/JsonWidget.tsx';
import { useStore } from './store.tsx';

export interface AppNumber {
  value: unknown;
  field: JsonField;
  at: number;
  error?: string;
}

let cache: Record<string, AppNumber> = {};
let loadedAt = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

async function load() {
  try {
    const res = await fetch('/api/appstats');
    if (res.ok) {
      cache = (await res.json()) as Record<string, AppNumber>;
      loadedAt = Date.now();
      listeners.forEach((fn) => fn());
    }
  } catch {
    /* keep the last numbers */
  }
}

/** Every app's live number, by app name. Empty when none are set up. */
export function useAppNumbers(): Record<string, AppNumber> {
  const { snap } = useStore();
  const wanted = snap?.catalog.statApps?.join('|') ?? '';
  const [, tick] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    if (Date.now() - loadedAt > 30_000) void load();
    timer ??= setInterval(load, 60_000);
    return () => {
      listeners.delete(fn);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, [wanted]);
  // A newly saved setup: fetch now rather than waiting a minute.
  useEffect(() => {
    if (wanted) void load();
  }, [wanted]);
  return wanted ? cache : {};
}

/** "48,213 queries", or null when there's nothing to show. */
export function numberText(n: AppNumber | undefined): { text: string; tone: 'ok' | 'warn' | 'crit' } | null {
  if (!n || n.error || n.value == null) return null;
  const v = formatValue(n.value, n.field);
  return { text: n.field.label ? `${v} ${n.field.label}` : v, tone: toneFor(n.field, n.value) };
}
