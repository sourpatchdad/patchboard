// The words on screen in another language. The English is the key, so the
// code reads as it always did and anything not yet translated stays in
// English rather than going blank. A catalog is a JSON file in web/i18n
// mapping English to the language; {name} marks a value filled in.
// Settings, Look picks the language for this device; until then it follows
// the browser when Patchboard has that language.

import es from '../i18n/es.json' with { type: 'json' };
import fr from '../i18n/fr.json' with { type: 'json' };
import { getAppearance } from './appearance.ts';

const CATALOGS: Record<string, Record<string, string>> = { es, fr };

/** Languages offered in Settings, each in its own words. */
export const LANGUAGES: [string, string][] = [
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
];

/** The language this device shows: chosen, or the browser's when there's a catalog for it. */
export function lang(): string {
  const chosen = getAppearance().lang;
  if (chosen) return chosen;
  const browser = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  return CATALOGS[browser] ? browser : 'en';
}

/** The words in this device's language, with {name} filled in from `vars`. */
export function t(english: string, vars?: Record<string, string | number>): string {
  const said = CATALOGS[lang()]?.[english] ?? english;
  return vars ? said.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : said;
}

/** One form or the other by the language's own plural rule: French counts 0 as one. */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  const single = new Intl.PluralRules(lang()).select(n) === 'one';
  return t(single ? one : many, { n, ...vars });
}
