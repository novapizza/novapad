import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Bundle chardet and iconv-lite INTO the workers (self-contained).
// Only externalize Node built-ins and electron — they are always available.
const WORKERS = ['searchWorker', 'largeJsonWorker']

for (const name of WORKERS) {
  await build({
    entryPoints: [resolve(root, `src/main/ipc/${name}.ts`)],
    outfile: resolve(root, `out/workers/${name}.js`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: [
      'electron',
      'worker_threads',
      'fs', 'path', 'os', 'crypto', 'stream', 'util',
      'events', 'buffer', 'url', 'net', 'child_process'
    ],
    target: 'node18'
  })
  console.log(`${name}.js built.`)
}
