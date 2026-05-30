import React from 'react'
import { Hash, Link, Key, Shield, Clock, Palette, Timer, Fingerprint, Type, type LucideIcon } from 'lucide-react'
import { HashPanel } from './panels/HashPanel'
import { UrlPanel } from './panels/UrlPanel'
import { JwtPanel } from './panels/JwtPanel'
import { CspPanel } from './panels/CspPanel'
import { EpochPanel } from './panels/EpochPanel'
import { ColorPanel } from './panels/ColorPanel'
import { CronPanel } from './panels/CronPanel'
import { UuidPanel } from './panels/UuidPanel'
import { LoremPanel } from './panels/LoremPanel'

export type ToolGroup = 'Hash' | 'Encoding & Web' | 'Converters' | 'Generators'

export interface ToolDef {
  id: string
  label: string
  group: ToolGroup
  icon: LucideIcon
  description: string
  Component: React.ComponentType
}

export const TOOL_GROUPS: ToolGroup[] = ['Hash', 'Encoding & Web', 'Converters', 'Generators']

export const TOOLS: ToolDef[] = [
  { id: 'hash', label: 'Hash (MD5 / SHA)', group: 'Hash', icon: Hash, description: 'MD5, SHA-1, SHA-256 and SHA-512 digests of text or files.', Component: HashPanel },
  { id: 'url', label: 'URL Encoder', group: 'Encoding & Web', icon: Link, description: 'Encode/decode URL components, full URLs, and parse query strings.', Component: UrlPanel },
  { id: 'jwt', label: 'JWT Decoder', group: 'Encoding & Web', icon: Key, description: 'Decode a JSON Web Token and inspect its claims.', Component: JwtPanel },
  { id: 'csp', label: 'CSP Tools', group: 'Encoding & Web', icon: Shield, description: 'Analyze a Content-Security-Policy for weaknesses.', Component: CspPanel },
  { id: 'epoch', label: 'Epoch Converter', group: 'Converters', icon: Clock, description: 'Convert between Unix timestamps and dates.', Component: EpochPanel },
  { id: 'color', label: 'Color Converter', group: 'Converters', icon: Palette, description: 'Convert HEX/RGB/HSL/OKLCH and check WCAG contrast.', Component: ColorPanel },
  { id: 'cron', label: 'Cron Builder', group: 'Converters', icon: Timer, description: 'Build and explain cron expressions, preview next runs.', Component: CronPanel },
  { id: 'uuid', label: 'UUID Generator', group: 'Generators', icon: Fingerprint, description: 'Generate UUID v1/v4/v7 and ULID identifiers.', Component: UuidPanel },
  { id: 'lorem', label: 'Lorem Ipsum', group: 'Generators', icon: Type, description: 'Generate placeholder text in several languages.', Component: LoremPanel }
]

export function getTool(id: string | null): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id)
}
