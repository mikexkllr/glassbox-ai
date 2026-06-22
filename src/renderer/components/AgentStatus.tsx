import { useStore } from '../store'

const ICON: Record<string, string> = { read_file: '📄', grep: '🔎', glob: '🗂️', ls: '📁', diff: '±' }

/** Live telemetry while the agent investigates a scope (overview / section / chat). */
export default function AgentStatus({ scope }: { scope: string }) {
  const live = useStore((s) => s.live[scope])
  if (!live || (!live.busy && !live.error)) return null

  // When retrying, busy=true even if error is stale — show spinner, not the old error.
  if (live.busy) {
    const recent = live.trail.slice(-5)
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
        <div className="flex items-center gap-2 text-[13px] text-glass-accent">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-glass-accent/30 border-t-glass-accent" />
          {live.status || 'Investigating…'}
        </div>
        {recent.length > 0 && (
          <ul className="mt-2 space-y-0.5 font-mono text-[10.5px] text-ink-600">
            {recent.map((t, i) => (
              <li key={i} className="animate-fade-in">
                <span className="mr-1">{ICON[t.tool] ?? '•'}</span>
                {t.tool} <span className="text-gray-400">{t.target}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Error state — compact pill, not a page-filler.
  return (
    <div className="flex items-center gap-2 rounded-lg border border-glass-del/30 bg-glass-del/8 px-3 py-2 text-[12px] text-glass-del">
      <span className="shrink-0">⚠</span>
      <span className="line-clamp-2 min-w-0">{live.error}</span>
    </div>
  )
}
