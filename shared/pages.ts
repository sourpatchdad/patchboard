// What each page shows, as chosen with its Customize button: sections hidden
// or reordered (Server), feeds and categories hidden (Feeds and Home's Feeds
// widget), sources and shows hidden (Upcoming and This week), stacks hidden
// (Stacks). Stored on the server so every device agrees. Hiding only affects
// what's shown: alerts still fire for everything.

export interface PageSettings {
  /** Section ids not shown. */
  hidden?: string[];
  /** Section ids in the order chosen; unlisted ones follow in their default order. */
  order?: string[];
  /** Names of things filtered out: feeds, categories, shows, sources, stacks. */
  hideFeeds?: string[];
  hideCategories?: string[];
  hideShows?: string[];
  hideSources?: string[];
  hideStacks?: string[];
}

export type PageId = 'server' | 'feeds' | 'upcoming' | 'stacks';
export type Pages = Partial<Record<PageId, PageSettings>>;

const PAGE_IDS: PageId[] = ['server', 'feeds', 'upcoming', 'stacks'];
const LIST_KEYS = ['hidden', 'order', 'hideFeeds', 'hideCategories', 'hideShows', 'hideSources', 'hideStacks'] as const;

export function validatePages(input: unknown): { pages: Pages } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Expected an object' };
  const pages: Pages = {};
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!PAGE_IDS.includes(id as PageId)) return { error: `Unknown page ${id.slice(0, 20)}` };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `Bad settings for ${id}` };
    const out: PageSettings = {};
    for (const k of LIST_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.length > 500 || !v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 200)) return { error: `Bad ${k} for ${id}` };
      if (v.length) out[k] = [...new Set(v as string[])];
    }
    pages[id as PageId] = out;
  }
  return { pages };
}

/** Section ids in display order: the chosen order first, then the rest as defined. */
export function arrange(ids: string[], s: PageSettings | undefined): string[] {
  const order = s?.order ?? [];
  const hidden = new Set(s?.hidden ?? []);
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? 1e6 + ids.indexOf(id) : i;
  };
  return ids.filter((id) => !hidden.has(id)).sort((a, b) => rank(a) - rank(b));
}
