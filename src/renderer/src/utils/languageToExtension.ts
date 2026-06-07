// Reverse map of `languageDetect.ts`. Given a Monaco language id, return the
// "primary" file extension we should suggest when the user hits Save on an
// untitled buffer (or Save As when the detected language differs from the
// current extension).

const langToExt: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  python: 'py',
  java: 'java',
  csharp: 'cs',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  perl: 'pl',
  r: 'r',
  shell: 'sh',
  powershell: 'ps1',
  bat: 'bat',
  sql: 'sql',
  yaml: 'yaml',
  xml: 'xml',
  ini: 'ini',
  markdown: 'md',
  latex: 'tex',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'objective-c': 'm',
  elixir: 'ex',
  fsharp: 'fs',
  haskell: 'hs',
  log: 'log',
  plaintext: 'txt'
}

const langDisplayName: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  dart: 'Dart',
  lua: 'Lua',
  perl: 'Perl',
  r: 'R',
  shell: 'Shell',
  powershell: 'PowerShell',
  bat: 'Batch',
  sql: 'SQL',
  yaml: 'YAML',
  xml: 'XML',
  ini: 'INI',
  markdown: 'Markdown',
  latex: 'LaTeX',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  'objective-c': 'Objective-C',
  elixir: 'Elixir',
  fsharp: 'F#',
  haskell: 'Haskell',
  log: 'Log',
  plaintext: 'Text'
}

export function languageToExtension(language: string | undefined | null): string | null {
  if (!language) return null
  return langToExt[language] ?? null
}

export function languageDisplayName(language: string | undefined | null): string {
  if (!language) return 'File'
  return langDisplayName[language] ?? language
}
