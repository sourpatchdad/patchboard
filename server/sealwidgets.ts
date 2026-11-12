// API numbers widgets take a URL and headers, and people paste keys into
// both. A board travels: to every browser, into setup exports. So before a
// board is stored, any key typed into a widget moves into the encrypted key
// store and the widget keeps a ${secret:NAME} reference in its place, which
// only the server resolves.

import type { Board } from '../shared/board.ts';
import { type JsonWidgetConfig, SECRET_REF, validateJsonConfig } from '../shared/jsonwidget.ts';
import { setSecret } from './secrets.ts';

/** Headers whose value is a credential. */
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|api-?key|x-api-?key|x-auth-token|x-.*-token|.*-?token|.*secret.*|.*-key)$/i;
/** Query parameters whose value is a credential, as in redact.ts. */
const SECRET_PARAM = /^(api[_-]?key|apikey|key|access[_-]?token|auth[_-]?token|token|passkey|password|passwd|pwd|secret|client[_-]?secret|x-plex-token|x-api-key)$/i;
const SCHEME = /^(bearer|basic|token|apikey)\s+/i;
const REF_ONLY = new RegExp(`^(?:${SECRET_REF.source}|\\$\\{env:[A-Z0-9_]+\\})$`);

function keyName(board: string, widget: string, part: string): string {
  return `W_${board}_${widget}_${part}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .slice(0, 40);
}

/** One widget's config with typed-in keys moved out. Returns null when there was nothing to move. */
export function sealConfig(cfg: JsonWidgetConfig, board: string, widget: string, save: (name: string, value: string) => void): JsonWidgetConfig | null {
  let changed = false;
  const stash = (part: string, value: string) => {
    const name = keyName(board, widget, part);
    save(name, value);
    changed = true;
    return `\${secret:${name}}`;
  };

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.headers)) {
    const scheme = v.match(SCHEME)?.[0] ?? '';
    const rest = v.slice(scheme.length).trim();
    headers[k] = SECRET_HEADER.test(k) && rest && !REF_ONLY.test(rest) ? scheme + stash(k, rest) : v;
  }

  let url = cfg.url;
  const m = url.match(/^(https?:\/\/)([^/?#@]*@)?([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (m) {
    let [, proto, userinfo = '', rest, query = '', hash = ''] = m;
    // user:password@host
    const colon = userinfo.indexOf(':');
    if (colon >= 0) {
      const pass = userinfo.slice(colon + 1, -1);
      if (pass && !REF_ONLY.test(pass)) userinfo = `${userinfo.slice(0, colon + 1)}${stash('PASSWORD', pass)}@`;
    }
    if (query) {
      query =
        '?' +
        query
          .slice(1)
          .split('&')
          .map((pair) => {
            const eq = pair.indexOf('=');
            if (eq < 0) return pair;
            const name = pair.slice(0, eq);
            const value = pair.slice(eq + 1);
            return SECRET_PARAM.test(decodeURIComponent(name)) && value && !REF_ONLY.test(value) ? `${name}=${stash(name, value)}` : pair;
          })
          .join('&');
    }
    url = proto + userinfo + rest + query + hash;
  }
  return changed ? { ...cfg, url, headers } : null;
}

/** A board with every API numbers widget's typed-in keys moved to the key store. */
export function sealBoard(boardId: string, board: Board, save: (name: string, value: string) => void = setSecret): Board {
  let changed = false;
  const widgets = board.widgets.map((w) => {
    if (w.type !== 'json' || !w.config?.json) return w;
    const v = validateJsonConfig(JSON.parse(w.config.json));
    if ('error' in v) return w;
    const sealed = sealConfig(v.config, boardId, w.id, save);
    if (!sealed) return w;
    changed = true;
    return { ...w, config: { ...w.config, json: JSON.stringify(sealed) } };
  });
  return changed ? { ...board, widgets } : board;
}

/** App live numbers with typed-in keys moved to the key store, as boards get. */
export function sealOrder<T extends { stats?: Record<string, JsonWidgetConfig> }>(order: T, save: (name: string, value: string) => void = setSecret): T {
  if (!order.stats) return order;
  let changed = false;
  const stats: Record<string, JsonWidgetConfig> = {};
  for (const [app, cfg] of Object.entries(order.stats)) {
    const sealed = sealConfig(cfg, 'apps', app, save);
    if (sealed) changed = true;
    stats[app] = sealed ?? cfg;
  }
  return changed ? { ...order, stats } : order;
}
