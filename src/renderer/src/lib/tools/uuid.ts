/**
 * UUID / ULID generators — pure logic, no React dependency.
 * Ported from exifmaster-pro's UuidGenerator component. Uses the browser
 * `crypto` API (available in the Electron renderer).
 */

export type UuidType = 'v4' | 'v7' | 'v1' | 'ulid'
export type UuidOutputFormat = 'lines' | 'array' | 'sql' | 'csv'

export function generateUUIDv4(): string {
  return crypto.randomUUID()
}

export function generateUUIDv1(): string {
  const unixToGregorian = 122192928000000000n
  const t = BigInt(Date.now()) * 10000n + unixToGregorian

  const timeLow = t & 0xffffffffn
  const timeMid = (t >> 32n) & 0xffffn
  const timeHi = (t >> 48n) & 0x0fffn

  const rnd = crypto.getRandomValues(new Uint8Array(8))
  const clockSeq = ((rnd[0] & 0x3f) << 8) | rnd[1]
  const node = Array.from(rnd.slice(2))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const pad = (n: bigint | number, len: number): string =>
    (typeof n === 'bigint' ? n : BigInt(n)).toString(16).padStart(len, '0')

  return [pad(timeLow, 8), pad(timeMid, 4), pad(0x1000n | timeHi, 4), pad(0x8000 | clockSeq, 4), node].join('-')
}

export function generateUUIDv7(): string {
  const ms = BigInt(Date.now())
  const rnd = crypto.getRandomValues(new Uint8Array(10))

  const tsHigh = (ms >> 16n) & 0xffffffffn
  const tsLow = ms & 0xffffn
  const randA = ((rnd[0] & 0x0f) << 8) | rnd[1]
  const variantBits = 0x8000 | ((rnd[2] & 0x3f) << 8) | rnd[3]
  const nodeHex = Array.from(rnd.slice(4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const pad = (n: bigint | number, len: number): string =>
    (typeof n === 'bigint' ? n : BigInt(n)).toString(16).padStart(len, '0')

  return [pad(tsHigh, 8), pad(tsLow, 4), pad(0x7000 | randA, 4), pad(variantBits, 4), nodeHex].join('-')
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateULID(): string {
  const ms = BigInt(Date.now())
  const rnd = crypto.getRandomValues(new Uint8Array(10))
  let r = 0n
  for (const b of rnd) r = (r << 8n) | BigInt(b)

  const enc = (val: bigint, len: number): string => {
    let out = ''
    for (let i = 0; i < len; i++) {
      out = B32[Number(val & 0x1fn)] + out
      val >>= 5n
    }
    return out
  }

  return enc(ms, 10) + enc(r, 16)
}

export function generateIds(type: UuidType, count: number): string[] {
  const gen =
    type === 'v1' ? generateUUIDv1 : type === 'v7' ? generateUUIDv7 : type === 'ulid' ? generateULID : generateUUIDv4
  const clamped = Math.min(Math.max(count, 1), 1000)
  return Array.from({ length: clamped }, gen)
}

export function formatUuidOutput(ids: string[], fmt: UuidOutputFormat): string {
  if (!ids.length) return ''
  switch (fmt) {
    case 'lines':
      return ids.join('\n')
    case 'array':
      return JSON.stringify(ids, null, 2)
    case 'sql':
      return `IN (\n  ${ids.map((id) => `'${id}'`).join(',\n  ')}\n)`
    case 'csv':
      return ids.join(', ')
  }
}
