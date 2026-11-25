/**
 * What the folder walker (Quick Open / Ctrl+E index and Find in Files) skips.
 *
 * NovaPad only edits text, so binary files are noise in the file index — and
 * on a real workspace build output is the bigger share (measured on one dev
 * folder: 169k files, 34% binary by extension, 57% under build dirs, against
 * a 20k index cap). Both checks are name-only, so they cost no file I/O.
 *
 * `build` and `bin` are deliberately NOT excluded: they are often hand-written
 * (electron-builder resources, npm `bin/` scripts). `.NET` output is still cut
 * through its sibling `obj/`, and the big offenders (`target/`, `out/`,
 * `dist/`) are covered.
 */

const BINARY_EXTENSIONS = new Set([
  // images (svg is text — kept)
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns', 'webp', 'tif', 'tiff', 'psd', 'heic', 'avif',
  // native / compiled
  'exe', 'dll', 'so', 'dylib', 'pdb', 'lib', 'obj', 'o', 'a', 'class', 'jar', 'pyc', 'pyo',
  'rlib', 'rmeta', 'bc', 'wasm', 'node', 'asar',
  // archives & installers
  'zip', '7z', 'rar', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'msi', 'dmg', 'iso', 'nupkg', 'blockmap', 'deb', 'rpm', 'apk',
  // documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // media
  'mp3', 'mp4', 'wav', 'mov', 'avi', 'mkv', 'webm', 'ogg', 'flac', 'm4a', 'aac',
  // data stores
  'db', 'sqlite', 'sqlite3', 'mdb', 'bin', 'dat', 'pak'
])

const EXCLUDED_DIRS = new Set([
  'node_modules', 'out', 'dist', 'target', 'obj', '__pycache__',
  'test-results', 'playwright-report', 'coverage'
])

/** True when the file name's extension marks it as binary (NovaPad can't edit it). */
export function isBinaryFileName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false // no extension, or a dotfile like `.env`
  return BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** True for build/cache output folders the walker should not descend into. */
export function isExcludedDirName(name: string): boolean {
  return EXCLUDED_DIRS.has(name)
}
