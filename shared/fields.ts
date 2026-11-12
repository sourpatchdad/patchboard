// Text settings a widget can take: feeds, time zones, repositories, a search
// engine. Each one checks and cleans its own value, the same way on the
// server (saving a board) and in the browser (the settings drawer).

export interface WidgetField {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  /** One entry per line. */
  multiline?: boolean;
  /** A fixed choice instead of free text: value and label. */
  choices?: [string, string][];
  /**
   * Tick boxes from what Patchboard already knows (the catalog's groups,
   * Frigate's cameras) instead of typing names. Stored one per line, like
   * `multiline`; nothing ticked means all of them.
   */
  pick?: 'groups' | 'cameras';
  /** The cleaned value, or null when it isn't usable. Empty input clears the setting. */
  check: (raw: string) => string | null;
}

const lines = (raw: string, max: number) =>
  raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max);

/** Camera names as Frigate spells them; blank shows every camera. */
export const camerasField: WidgetField = {
  key: 'cameras',
  label: 'Cameras',
  hint: 'Names as Frigate spells them, one per line. Leave empty for every camera.',
  placeholder: 'front_door',
  multiline: true,
  pick: 'cameras',
  check: (raw) => {
    const ok = lines(raw, 24).filter((c) => /^[\w-]{1,64}$/.test(c));
    return ok.length ? ok.join('\n') : null;
  },
};

/** App groups by name, as in Edit apps; blank shows every group. */
export const groupsField: WidgetField = {
  key: 'groups',
  label: 'Groups',
  hint: 'Tick the groups this board shows. None ticked shows them all.',
  multiline: true,
  pick: 'groups',
  check: (raw) => {
    const ok = lines(raw, 40).filter((g) => g.length <= 60);
    return ok.length ? ok.join('\n') : null;
  },
};

/** Feed addresses: http or https, ten at most. */
export const feedsField: WidgetField = {
  key: 'feeds',
  label: 'Feeds',
  hint: 'RSS or Atom addresses, one per line. Up to ten.',
  placeholder: 'https://example.com/feed.xml',
  multiline: true,
  check: (raw) => {
    const ok = lines(raw, 10).filter((u) => /^https?:\/\/[^\s]{3,500}$/i.test(u));
    return ok.length ? ok.join('\n') : null;
  },
};

/** "Tokyo=Asia/Tokyo" or "Asia/Tokyo", eight at most; zones the browser and server both know. */
export const zonesField: WidgetField = {
  key: 'zones',
  label: 'Places',
  hint: 'One per line: a time zone such as Europe/London, or Name=Europe/London to label it.',
  placeholder: 'Mum=Europe/London',
  multiline: true,
  check: (raw) => {
    const ok = lines(raw, 8).filter((l) => {
      const zone = (l.includes('=') ? l.slice(l.indexOf('=') + 1) : l).trim();
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone) && zone.length <= 64 && l.length <= 80;
      } catch {
        return false;
      }
    });
    return ok.length ? ok.join('\n') : null;
  },
};

/** GitHub repositories as owner/name, or their web address; twenty at most. */
export const reposField: WidgetField = {
  key: 'repos',
  label: 'Projects',
  hint: 'GitHub projects, one per line: owner/name or the project address.',
  placeholder: 'immich-app/immich',
  multiline: true,
  check: (raw) => {
    const ok = lines(raw, 20)
      .map((l) => l.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/, ''))
      .filter((r) => /^[\w.-]{1,39}\/[\w.-]{1,100}$/.test(r));
    return ok.length ? [...new Set(ok)].join('\n') : null;
  },
};

export const ENGINES: Record<string, { name: string; url: string }> = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
};

export const engineField: WidgetField = {
  key: 'engine',
  label: 'Search with',
  choices: [...Object.entries(ENGINES).map(([k, e]): [string, string] => [k, e.name]), ['custom', 'Another site']],
  check: (raw) => (raw in ENGINES || raw === 'custom' ? raw : null),
};

/** Another search site: an https address with %s where the words go. */
export const searchUrlField: WidgetField = {
  key: 'url',
  label: 'Search address',
  hint: 'For Another site: an https address with %s where your words go.',
  placeholder: 'https://search.example.com/?q=%s',
  check: (raw) => (/^https:\/\/[^\s]{3,300}$/i.test(raw.trim()) && raw.includes('%s') ? raw.trim() : null),
};

/** Where a search goes. */
export function searchUrl(cfg: Record<string, string> | undefined, words: string): string {
  const template = cfg?.engine === 'custom' && cfg.url ? cfg.url : (ENGINES[cfg?.engine ?? ''] ?? ENGINES.duckduckgo).url;
  return template.replace('%s', encodeURIComponent(words));
}

/**
 * Markets: one per line, with an optional label. Coins (BTC, bitcoin) come
 * from CoinGecko, a pair of currencies (EUR/USD) from the European Central
 * Bank, and anything else (AAPL, ^GSPC, VTI) from Yahoo Finance.
 */
export const symbolsField: WidgetField = {
  key: 'symbols',
  label: 'What to follow',
  hint: 'One per line: a coin (BTC), a stock or fund (AAPL, VTI), an index (^GSPC) or two currencies (EUR/USD). Write S&P 500=^GSPC to name it.',
  placeholder: 'Bitcoin=BTC',
  multiline: true,
  check: (raw) => {
    const ok = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((l) => {
        const at = l.lastIndexOf('=');
        // "EURUSD=X" is a Yahoo symbol, not a label: only split where a label could be.
        const label = at > 0 && !/^[A-Z]{6}=X$/i.test(l) ? l.slice(0, at).trim().slice(0, 24) : '';
        const sym = (label ? l.slice(at + 1) : l).trim().toUpperCase();
        return /^[\^A-Z0-9.=/-]{1,20}$/.test(sym) ? (label ? `${label}=${sym}` : sym) : null;
      })
      .filter((l): l is string => !!l);
    return ok.length ? [...new Set(ok)].join('\n') : null;
  },
};

/** Countdowns: Name=2026-12-25 for a day, or Name=12-25 for the same day every year. */
export const eventsField: WidgetField = {
  key: 'events',
  label: 'Days to count to',
  hint: 'One per line: Name=2026-12-25, or Name=12-25 for the same day every year.',
  placeholder: 'Vacation=2027-03-14',
  multiline: true,
  check: (raw) => {
    const ok = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((l) => {
        const at = l.lastIndexOf('=');
        if (at < 1) return null;
        const name = l.slice(0, at).trim().slice(0, 32);
        const day = l.slice(at + 1).trim();
        const m = /^(?:(\d{4})-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(day);
        // A day that exists: no February 30th. A yearly one may be the 29th.
        const real = m && new Date(Number(m[1] ?? 2024), Number(m[2]) - 1, Number(m[3])).getDate() === Number(m[3]);
        return name && real ? `${name}=${day}` : null;
      })
      .filter((l): l is string => !!l);
    return ok.length ? ok.join('\n') : null;
  },
};
