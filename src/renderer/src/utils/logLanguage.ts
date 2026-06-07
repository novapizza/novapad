import * as monaco from 'monaco-editor'

// A single, format-agnostic syntax highlighter for log AND trace files.
//
// There are unbounded log dialects out there — app logs, access logs, syslog,
// CloudWatch, JFR/strace traces, structured key=value logs — and trying to
// detect each format is a losing game. But every one of them is assembled from
// the same small alphabet of lexical atoms: timestamps, severity levels,
// numbers/quantities, durations, IDs, quoted strings, bracketed tags, and
// key=value pairs. So instead of a grammar per format we ship ONE Monarch
// tokenizer whose rules match those atoms wherever they appear on a line.
//
// Monarch is line-oriented and first-match-wins per position, which is exactly
// what logs want: each line is independent and we never try to track structure
// across lines (stateless = robust; a malformed line can't corrupt the rest).
//
// A `.trace` file is, lexically, just a log — so its extensions alias to this
// same language id (see languageDetect.ts) and pick up the duration/ID rules
// that traces lean on.

export const LOG_LANGUAGE_ID = 'log'

/** Extensions (and rotation-aware bases) that resolve to the `log` language. */
export const LOG_EXTENSIONS = ['.log', '.trace', '.trc', '.out', '.err']

// Severity keyword groups (lowercase; matched case-insensitively via ignoreCase
// below) so we catch both `[info]` (electron-log/pino style) and `INFO`
// (syslog/Java style). Bare words are matched through Monarch `cases` on a
// whole-identifier token — NOT a `\b…\b` regex — so "error" lights up on its
// own but never as a fragment of "myerror" or "NullPointerException". This also
// means the words light up inside free-text messages, which is desirable for
// logs (you want "error" to jump out).
const ERROR_WORDS = ['error', 'fatal', 'critical', 'severe', 'panic', 'emergency', 'exception']
const WARN_WORDS = ['warning', 'warn']
const INFO_WORDS = ['info', 'notice', 'information']
const DEBUG_WORDS = ['debug', 'verbose', 'trace']

// Bracketed variants additionally swallow the surrounding [] so the whole
// `[info]` token gets the severity color rather than a tag color.
const BRACKET_ERROR = `\\[(?:${[...ERROR_WORDS, 'err', 'crit', 'alert', 'fail(?:ed|ure)?'].join('|')})\\]`
const BRACKET_WARN = `\\[(?:${WARN_WORDS.join('|')})\\]`
const BRACKET_INFO = `\\[(?:${INFO_WORDS.join('|')})\\]`
const BRACKET_DEBUG = `\\[(?:${[...DEBUG_WORDS, 'trc', 'dbg'].join('|')})\\]`

export const LOG_MONARCH: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,
  // Word sets referenced by `@name` in the `cases` rule below.
  logErrorWords: ERROR_WORDS,
  logWarnWords: WARN_WORDS,
  logInfoWords: INFO_WORDS,
  logDebugWords: DEBUG_WORDS,
  tokenizer: {
    root: [
      // --- Timestamps (match first so their inner digits/colons aren't
      // re-tokenized as numbers). Bracketed forms consume the [] too. ---
      [/\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]/, 'date.log'],
      [/\[\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]/, 'date.log'],
      [/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/, 'date.log'],
      [/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/, 'date.log'],
      [/\b\d{4}-\d{2}-\d{2}\b/, 'date.log'],
      [/\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/, 'date.log'],

      // --- Severity levels (bracketed form; bare words handled by the
      // identifier `cases` rule lower down). ---
      [new RegExp(BRACKET_ERROR), 'loglevel.error.log'],
      [new RegExp(BRACKET_WARN), 'loglevel.warn.log'],
      [new RegExp(BRACKET_INFO), 'loglevel.info.log'],
      [new RegExp(BRACKET_DEBUG), 'loglevel.debug.log'],

      // --- Special literals (most-specific first so they win over plain numbers). ---
      [/\bhttps?:\/\/[^\s<>"')\]]+/, 'url.log'],
      [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, 'uuid.log'],
      [/\b0x[0-9a-f]+\b/, 'number.hex.log'],
      [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/, 'ipaddr.log'],
      // Trace / span IDs — long hex runs (OpenTelemetry: 16-hex span, 32-hex trace).
      [/\b[0-9a-f]{16,32}\b/, 'traceid.log'],

      // --- HTTP method (access logs). Guarded by a lookahead requiring a
      // following request target, so the common English words get/post/head/…
      // in prose don't light up. ---
      [/\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT)(?=\s+(?:\/|https?:))/, 'http.method.log'],

      // Call / flow arrows common in method & syscall traces.
      [/-->|<--|->|=>|<-/, 'flow.log'],

      // Quoted strings (messages, paths, user-agents).
      [/"[^"]*"/, 'string.log'],
      [/'[^']*'/, 'string.log'],

      // Durations — the heartbeat of trace files. Before quantities/numbers.
      [/\b\d+(?:\.\d+)?\s?(?:ns|us|µs|ms|s)\b/, 'duration.log'],
      // Quantities with size/percent units. The \b is required only after the
      // letter-unit form (GB/MB/…); `%` is non-word so a trailing \b would
      // never match a percentage followed by a space.
      [/\b\d+(?:\.\d+)?\s?(?:%|[KMGT]?B\b)/, 'quantity.log'],

      // key=value / key: value — color the key (e.g. CPU:, level=, status=).
      [/[A-Za-z_][\w.-]*(?=\s*[:=])/, 'key.log'],

      // Bare severity words. Matching a whole identifier and branching with
      // `cases` (instead of a `\b…\b` regex) guarantees whole-word hits only —
      // "error" colors, "NullPointerException"/"myerror" do not. Placed after
      // the special-literal and key rules so hex IDs / keys win first.
      [/[a-zA-Z_][a-zA-Z0-9_]*/, {
        cases: {
          '@logErrorWords': 'loglevel.error.log',
          '@logWarnWords': 'loglevel.warn.log',
          '@logInfoWords': 'loglevel.info.log',
          '@logDebugWords': 'loglevel.debug.log',
          '@default': ''
        }
      }],

      // Process / thread ids like (14514).
      [/\(\d+\)/, 'tag.dim.log'],
      // Generic bracketed component tags like [SYSTEM] [ELECTRON].
      [/\[[^\]\r\n]*\]/, 'tag.log'],

      // Anything else numeric.
      [/\b\d+(?:\.\d+)?\b/, 'number.log'],
    ],
  },
}

// Token → color rules, spread into the npp themes (monacoThemes.ts). Palette is
// kept tight — ~7 semantic roles — so a log reads at a glance instead of like a
// rainbow: severity (red/amber/green), dim metadata (gray), blue identifiers,
// purple IDs/tags, orange numbers, red strings.
export const LOG_LIGHT_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: 'date.log', foreground: '808080' },
  { token: 'loglevel.error.log', foreground: 'CB2431', fontStyle: 'bold' },
  { token: 'loglevel.warn.log', foreground: 'B08800', fontStyle: 'bold' },
  { token: 'loglevel.info.log', foreground: '1A7F37', fontStyle: 'bold' },
  { token: 'loglevel.debug.log', foreground: '808080', fontStyle: 'italic' },
  { token: 'http.method.log', foreground: '0550AE', fontStyle: 'bold' },
  { token: 'flow.log', foreground: '0550AE' },
  { token: 'url.log', foreground: '0550AE', fontStyle: 'underline' },
  { token: 'ipaddr.log', foreground: '0550AE' },
  { token: 'key.log', foreground: '0550AE' },
  { token: 'uuid.log', foreground: '6F42C1' },
  { token: 'traceid.log', foreground: '6F42C1' },
  { token: 'tag.log', foreground: '6F42C1', fontStyle: 'bold' },
  { token: 'tag.dim.log', foreground: '808080' },
  { token: 'duration.log', foreground: 'BC5000', fontStyle: 'bold' },
  { token: 'quantity.log', foreground: 'BC5000' },
  { token: 'number.hex.log', foreground: 'BC5000' },
  { token: 'number.log', foreground: 'BC5000' },
  { token: 'string.log', foreground: 'A31515' },
]

export const LOG_DARK_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: 'date.log', foreground: '7C7C7C' },
  { token: 'loglevel.error.log', foreground: 'FF8080', fontStyle: 'bold' },
  { token: 'loglevel.warn.log', foreground: 'DFC47D', fontStyle: 'bold' },
  { token: 'loglevel.info.log', foreground: '7F9F7F', fontStyle: 'bold' },
  { token: 'loglevel.debug.log', foreground: '7C7C7C', fontStyle: 'italic' },
  { token: 'http.method.log', foreground: '8CD0D3', fontStyle: 'bold' },
  { token: 'flow.log', foreground: '8CD0D3' },
  { token: 'url.log', foreground: '8CD0D3', fontStyle: 'underline' },
  { token: 'ipaddr.log', foreground: '8CD0D3' },
  { token: 'key.log', foreground: '8CD0D3' },
  { token: 'uuid.log', foreground: 'DC8CC3' },
  { token: 'traceid.log', foreground: 'DC8CC3' },
  { token: 'tag.log', foreground: 'E3CEAB', fontStyle: 'bold' },
  { token: 'tag.dim.log', foreground: '7C7C7C' },
  { token: 'duration.log', foreground: 'F0DFAF', fontStyle: 'bold' },
  { token: 'quantity.log', foreground: 'F0DFAF' },
  { token: 'number.hex.log', foreground: 'F0DFAF' },
  { token: 'number.log', foreground: 'F0DFAF' },
  { token: 'string.log', foreground: 'CC9393' },
]

let registered = false

/** Register the `log` language + its Monarch tokenizer. Idempotent. */
export function registerLogLanguage(): void {
  if (registered) return
  registered = true
  monaco.languages.register({ id: LOG_LANGUAGE_ID, extensions: LOG_EXTENSIONS, aliases: ['Log', 'Trace'] })
  monaco.languages.setMonarchTokensProvider(LOG_LANGUAGE_ID, LOG_MONARCH)
}
