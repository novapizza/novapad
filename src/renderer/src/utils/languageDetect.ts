const extMap: Record<string, string> = {
  // Web
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'typescript',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  xml: 'xml', svg: 'xml', xsd: 'xml', xsl: 'xml',
  // Systems
  c: 'c', h: 'c',
  cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', hxx: 'cpp',
  cs: 'csharp',
  java: 'java',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  // Scripting
  py: 'python', pyw: 'python',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  // Shell
  sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'powershell', psm1: 'powershell',
  bat: 'bat', cmd: 'bat',
  // Data
  sql: 'sql',
  sqlplan: 'xml',   // SQL Server execution plan — XML under the hood; Ctrl+P opens the modern plan viewer
  csv: 'csv',
  tsv: 'csv',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  // Docs
  md: 'markdown', mdx: 'markdown',
  tex: 'latex',
  // Logs & traces — all share one format-agnostic highlighter (see logLanguage.ts)
  log: 'log', trace: 'log', trc: 'log', out: 'log', err: 'log',
  // Other
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  r: 'r',
  m: 'objective-c',
  ex: 'elixir', exs: 'elixir',
  fs: 'fsharp', fsi: 'fsharp',
  hs: 'haskell',
  dart: 'dart',
  vue: 'html',
  svelte: 'html'
}

export function detectLanguage(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? ''

  // Special filenames
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile'
  if (name.toLowerCase() === 'makefile' || name.toLowerCase() === 'gnumakefile') return 'makefile'

  const segments = name.toLowerCase().split('.')
  let ext = segments[segments.length - 1] ?? ''

  // Rotated logs (app.log.1, service.log.2026-02-24, trace.0) end in a numeric
  // or date suffix that hides the real extension. Fall back to the segment
  // before it so they still highlight as logs/traces.
  if (
    segments.length >= 3 &&
    (/^\d+$/.test(ext) || /^\d{4}-\d{2}-\d{2}$/.test(ext))
  ) {
    ext = segments[segments.length - 2] ?? ext
  }

  return extMap[ext] ?? 'plaintext'
}
