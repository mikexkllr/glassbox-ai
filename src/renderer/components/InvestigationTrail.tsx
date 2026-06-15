import { useState } from 'react'
import type { TrailEntry } from '@shared/types'

const ICON: Record<string, string> = {
  read_file: '📄',
  grep: '🔎',
  glob: '🗂️',
  ls: '📁',
  diff: '±'
}

/** "Glassbox read auth/types.ts, user_service.py, and the tests to explain this." */
export default function TrailChip({ trail }: { trail: TrailEntry[] }) {
  const [open, setOpen] = useState(false)
  if (!trail.length) return null

  const reads = trail.filter((t) => t.tool === 'read_file').map((t) => t.target)
  const uniqueReads = [...new Set(reads)]
  const summary =
    uniqueReads.length > 0
      ? `read ${uniqueReads.slice(0, 3).map(short).join(', ')}${uniqueReads.length > 3 ? ` +${uniqueReads.length - 3} more` : ''}`
      : `${trail.length} lookups`

  return (
    <div className="mt-2 text-[11px]">
      <button onClick={() => setOpen((o) => !o)} className="no-drag text-ink-600 hover:text-glass-accent">
        🔬 Glassbox {summary} to explain this {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 rounded border border-ink-700 bg-ink-900/60 p-2 font-mono text-[10.5px] text-gray-400">
          {trail.map((t, i) => (
            <li key={i}>
              <span className="mr-1">{ICON[t.tool] ?? '•'}</span>
              <span className="text-ink-600">{t.tool}</span> {t.target}
              {t.detail ? <span className="text-ink-600"> · {t.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function short(p: string): string {
  const parts = p.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}
