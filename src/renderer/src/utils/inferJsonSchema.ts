/**
 * Infer a JSON Schema (draft-07) from a sample JSON value. Best-effort: types
 * are derived structurally, object keys are all marked required, and array
 * item schemas are merged across elements (collapsing to `anyOf` when they
 * differ). Intended for export/scaffolding, not strict validation authoring.
 */
export function inferJsonSchema(value: unknown): Record<string, unknown> {
  return { $schema: 'http://json-schema.org/draft-07/schema#', ...inferNode(value) }
}

function inferNode(v: unknown): Record<string, unknown> {
  if (v === null) return { type: 'null' }
  if (Array.isArray(v)) {
    if (v.length === 0) return { type: 'array', items: {} }
    return { type: 'array', items: mergeItemSchemas(v.map(inferNode)) }
  }
  switch (typeof v) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: Number.isInteger(v) ? 'integer' : 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object': {
      const obj = v as Record<string, unknown>
      const keys = Object.keys(obj)
      const properties: Record<string, unknown> = {}
      for (const k of keys) properties[k] = inferNode(obj[k])
      return {
        type: 'object',
        properties,
        ...(keys.length ? { required: keys } : {})
      }
    }
    default:
      return {}
  }
}

/** Collapse a list of item schemas: identical → one; otherwise → anyOf of the distinct ones. */
function mergeItemSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  const distinct = new Map<string, Record<string, unknown>>()
  for (const s of schemas) distinct.set(JSON.stringify(s), s)
  const values = [...distinct.values()]
  return values.length === 1 ? values[0] : { anyOf: values }
}
