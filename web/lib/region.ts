// Region, per device: how dates, times, numbers and money are written. Set
// in Settings, Look; "match the browser" until someone picks. Formatting
// across the app asks here instead of passing no locale, so the choice
// reaches every date and number.

import { getAppearance } from './appearance.ts';

/** Regions offered in Settings: a language tag and its own name for itself. */
export const REGIONS: [string, string][] = [
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-CA', 'English (Canada)'],
  ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)'],
  ['fr-FR', 'Français (France)'],
  ['fr-CA', 'Français (Canada)'],
  ['de-DE', 'Deutsch (Deutschland)'],
  ['de-CH', 'Deutsch (Schweiz)'],
  ['es-ES', 'Español (España)'],
  ['es-MX', 'Español (México)'],
  ['it-IT', 'Italiano (Italia)'],
  ['nl-NL', 'Nederlands (Nederland)'],
  ['pt-BR', 'Português (Brasil)'],
  ['pt-PT', 'Português (Portugal)'],
  ['sv-SE', 'Svenska (Sverige)'],
  ['nb-NO', 'Norsk (Norge)'],
  ['da-DK', 'Dansk (Danmark)'],
  ['fi-FI', 'Suomi (Suomi)'],
  ['pl-PL', 'Polski (Polska)'],
  ['cs-CZ', 'Čeština (Česko)'],
  ['tr-TR', 'Türkçe (Türkiye)'],
  ['ru-RU', 'Русский (Россия)'],
  ['uk-UA', 'Українська (Україна)'],
  ['ja-JP', '日本語 (日本)'],
  ['ko-KR', '한국어 (대한민국)'],
  ['zh-CN', '中文 (中国)'],
  ['zh-TW', '中文 (台灣)'],
];

/** Currencies offered in Settings. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'TRY', 'ZAR', 'KRW', 'SGD', 'HKD', 'TWD', 'UAH'];

// A region's own money, for "match the region".
const MONEY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', CH: 'CHF', JP: 'JPY', CN: 'CNY', TW: 'TWD', HK: 'HKD', SG: 'SGD', KR: 'KRW',
  BR: 'BRL', MX: 'MXN', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', TR: 'TRY', ZA: 'ZAR', UA: 'UAH', RU: 'RUB',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR',
  LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
};

const browser = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

/** The language tag every date and number on this device is written in. */
export function locale(): string {
  const { locale: chosen, lang } = getAppearance();
  if (chosen) return chosen;
  // A language picked without a region: write dates in that language too.
  if (lang && !browser().toLowerCase().startsWith(lang)) return lang;
  try {
    return Intl.getCanonicalLocales(browser())[0] ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

/** The currency prices are shown in. */
export function currency(): string {
  const chosen = getAppearance().currency;
  if (chosen) return chosen;
  try {
    const region = new Intl.Locale(locale()).maximize().region ?? 'US';
    return MONEY[region] ?? 'USD';
  } catch {
    return 'USD';
  }
}

/** A price: 71,883 $ or $71,883.00, as the region writes it; small prices keep more digits. */
export function money(value: number, code: string, fixed?: number): string {
  const digits = fixed ?? (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4);
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${code}`;
  }
}

/** A plain number, grouped and pointed as the region writes it. */
export function num(value: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A change in percent with its sign: +0.42%, −1.8 %. */
export function pct(value: number): string {
  return new Intl.NumberFormat(locale(), { style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}
