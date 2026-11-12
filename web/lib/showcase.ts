// Showcase mode, per device: before a screenshot goes to a forum or a chat,
// addresses, domain names, email and MAC addresses become made-up ones that
// read like real ones, the words you list get stand-ins, and camera pictures
// blur. It works on the page as drawn, so every board, widget and log line is
// covered without each knowing about it. Fields you type in keep their real
// values, so nothing you save changes.

import { useSyncExternalStore } from 'react';

export interface Showcase {
  on: boolean;
  /** One per line: a word to hide, or "real = stand-in". */
  words: string;
}

const KEY = 'pb-showcase';
const NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Jamie', 'Quinn'];
// Stand-ins for listed words, which may be a server, a person or a town.
const WORDS = ['Atlas', 'Juno', 'Orion', 'Vega', 'Lyra', 'Nova', 'Iris', 'Echo'];
// Left alone: projects and services everyone links to.
const PUBLIC = /(^|\.)(github\.com|githubusercontent\.com|ghcr\.io|docker\.(io|com)|example\.(com|org|net)|home\.arpa)$/i;

const HOST = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|dev|app|me|co|us|uk|de|nl|fr|ca|au|xyz|cloud|tech|site|online|lan|local|home|internal|arpa|ts\.net)\b/gi;
const EMAIL = /\b[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MAC = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi;

function read(): Showcase {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Showcase>;
    return { on: saved.on === true, words: typeof saved.words === 'string' ? saved.words : '' };
  } catch {
    return { on: false, words: '' };
  }
}

let current = read();
const listeners = new Set<() => void>();

/** A swapper with its own memory, so one real value keeps one stand-in everywhere. */
export function makeSwapper(words: string): (text: string) => string {
  const seen = new Map<string, string>();
  const fakes = new Set<string>();
  const pick = (real: string, make: (n: number) => string) => {
    const key = real.toLowerCase();
    let fake = seen.get(key);
    if (!fake) {
      fake = make(seen.size);
      seen.set(key, fake);
      fakes.add(fake.toLowerCase());
    }
    return fake;
  };
  const listed = words
    .split('\n')
    .map((line) => line.split('=').map((s) => s.trim()))
    .filter(([real]) => real && real.length > 1)
    .map(([real, stand], i) => ({ re: new RegExp(`\\b${real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), stand: stand || WORDS[i % WORDS.length] }));
  for (const w of listed) fakes.add(w.stand.toLowerCase());
  return (text) => {
    let out = text;
    for (const w of listed) out = out.replace(w.re, w.stand);
    out = out.replace(EMAIL, (m) => (fakes.has(m.toLowerCase()) ? m : pick(m, (n) => `${NAMES[n % NAMES.length].toLowerCase()}@home.arpa`)));
    out = out.replace(IPV4, (m) => {
      if (fakes.has(m) || m.split('.').some((o) => Number(o) > 255)) return m;
      return pick(m, (n) => `192.168.1.${20 + (n % 230)}`);
    });
    out = out.replace(MAC, (m) => (fakes.has(m.toLowerCase()) ? m : pick(m, (n) => `02:00:00:00:00:${(n % 256).toString(16).padStart(2, '0')}`)));
    out = out.replace(HOST, (m) => {
      if (fakes.has(m.toLowerCase()) || PUBLIC.test(m)) return m;
      // Keep a service's own label, like plex or dash; the rest is yours.
      const labels = m.split('.');
      return pick(m, () => (labels.length > 2 ? `${labels[0]}.home.arpa` : 'home.arpa'));
    });
    return out;
  };
}

const SKIP = 'input, textarea, select, script, style, [contenteditable]';
let observer: MutationObserver | null = null;

function start(words: string): void {
  const swap = makeSwapper(words);
  const text = (node: Text) => {
    if (node.parentElement?.closest(SKIP)) return;
    const next = swap(node.data);
    if (next !== node.data) node.data = next;
  };
  const attrs = (el: Element) => {
    for (const name of ['title', 'aria-label', 'alt']) {
      const v = el.getAttribute(name);
      if (v) {
        const next = swap(v);
        if (next !== v) el.setAttribute(name, next);
      }
    }
  };
  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return text(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    attrs(root as Element);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) text(n as Text);
      else attrs(n as Element);
    }
  };
  walk(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') text(r.target as Text);
      else if (r.type === 'attributes') attrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'alt'] });
  document.documentElement.classList.add('showcase');
}

export function setShowcase(patch: Partial<Showcase>): void {
  const was = current;
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode: it lasts for this visit only.
  }
  for (const fn of listeners) fn();
  // The real text is gone from the page once swapped, so leaving or changing
  // the list draws the page again from scratch.
  if (was.on && (!current.on || was.words !== current.words)) location.reload();
  else if (current.on && !was.on) start(current.words);
}

export function useShowcase(): Showcase {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function initShowcase(): void {
  if (current.on) start(current.words);
}
