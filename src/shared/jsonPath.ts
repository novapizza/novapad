// Dot-path extraction over a parsed JSON value. Shared by the renderer's JSON
// tools (Extract tab) and the large-JSON worker (streaming extract), so it
// must stay free of DOM / Electron / Node imports.

export function extractByPath(data: unknown, path: string): unknown[] {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return []
  const results: unknown[] = []

  function resolve(node: unknown, remaining: string[]): void {
    if (remaining.length === 0) {
      if (Array.isArray(node)) node.forEach((v) => results.push(v))
      else results.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item) => resolve(item, remaining))
      return
    }
    if (node !== null && typeof node === 'object') {
      const key = remaining[0]
      const rest = remaining.slice(1)
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        resolve((node as Record<string, unknown>)[key], rest)
      } else {
        // Key not found at this level → search deeper. Lets users write a short
        // tail path like "_source.id" against a deeply nested ES hit.
        Object.values(node as Record<string, unknown>).forEach((child) => resolve(child, remaining))
      }
    }
  }

  resolve(data, parts)
  return results
}
