// Apps write their own keys into their logs: Sonarr logs indexer URLs with
// the API key and torrent passkey in them, Plex logs X-Plex-Token. Every
// log line and health-check output is masked here, on the server, before it
// reaches a browser, so a screen share or a screenshot doesn't carry them.

const MASK = '••••';

/** Names whose value is a secret, in a URL query, a form, or key=value text. */
const NAMES = [
  'api[_-]?key',
  'apikey',
  'access[_-]?token',
  'refresh[_-]?token',
  'auth[_-]?token',
  'token',
  'passkey',
  'torrent_pass',
  'password',
  'passwd',
  'pwd',
  'secret',
  'client[_-]?secret',
  'signature',
  'sig',
  'x-plex-token',
  'x-emby-token',
  'x-api-key',
].join('|');

const RULES: [RegExp, string][] = [
  // ?apikey=abc&token=def, key=value pairs in any text. `key` alone only inside a query.
  [new RegExp(`((?:^|[?&;\\s"'(,])(?:${NAMES})=)[^&\\s"'<>)]+`, 'gi'), `$1${MASK}`],
  [/([?&]key=)[^&\s"'<>)]+/gi, `$1${MASK}`],
  // Headers: "Authorization: Bearer abc", "X-Api-Key: abc".
  [/((?:authorization|x-api-key|x-plex-token|x-emby-token|x-mediabrowser-token)\s*[:=]\s*(?:bearer\s+|basic\s+|token\s+)?)[^\s"',;]+/gi, `$1${MASK}`],
  // JSON: "apiKey": "abc".
  [new RegExp(`("(?:${NAMES})"\\s*:\\s*")[^"]*(")`, 'gi'), `$1${MASK}$2`],
  // A password inside a URL: scheme://user:pass@host.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+(@)/gi, `$1${MASK}$2`],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out;
}
