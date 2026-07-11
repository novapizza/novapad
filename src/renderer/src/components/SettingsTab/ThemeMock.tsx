import React from 'react'
import { cn } from '../../lib/utils'
import { ThemePreview } from '../../utils/themes'

/** Tiny editor mock painted in a theme's colors, used by the theme picker. */
export function EditorMock({ c, className }: { c: ThemePreview; className?: string }): React.ReactElement {
  return (
    <div className={cn('overflow-hidden', className)} style={{ background: c.bg }}>
      <div className="flex items-center gap-1 h-4 px-1.5" style={{ background: c.chrome }}>
        <span className="w-1 h-1 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="w-1 h-1 rounded-full" style={{ background: '#febc2e' }} />
        <span className="w-1 h-1 rounded-full" style={{ background: '#28c840' }} />
      </div>
      <div className="p-1.5 font-mono text-[8px] leading-[1.7]">
        <div>
          <span style={{ color: c.kw }}>const</span> <span style={{ color: c.text }}>n</span>{' '}
          <span style={{ color: c.text }}>=</span> <span style={{ color: c.str }}>&quot;Nova&quot;</span>
        </div>
        <div style={{ color: c.com }}>// {`{ N }`}</div>
        <div>
          <span style={{ color: c.kw }}>fn</span> <span style={{ color: c.accent }}>run</span>
          <span style={{ color: c.text }}>() {'{'}</span>
        </div>
        <div style={{ paddingLeft: 8, color: c.num }}>42</div>
      </div>
    </div>
  )
}
