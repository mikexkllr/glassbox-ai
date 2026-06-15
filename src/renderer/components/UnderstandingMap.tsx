import { useStore } from '../store'
import { cn } from '../lib/files'

/** A gentle coverage map — where you've been vs. what's left. Navigation, not a grade. */
export default function UnderstandingMap() {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const walked = useStore((s) => s.walked)
  const live = useStore((s) => s.live)

  const plans = overview?.sections ?? []
  const total = plans.length
  const done = plans.filter((p) => walked.includes(p.id)).length
  const pct = total ? Math.round((done / total) * 100) : 0

  const go = (id: string) => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="flex h-full w-64 flex-none flex-col border-r border-ink-800 bg-ink-900/40">
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-600">Understanding map</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-glass-accent2 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-600">
            {done}/{total}
          </span>
        </div>
        <p className="mt-1 text-[10.5px] text-ink-600">
          {pct === 100 ? "you've walked the whole change ✓" : 'a map of what you have explored'}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {plans.map((p, i) => {
          const isWalked = walked.includes(p.id)
          const isBusy = live[p.id]?.busy
          const isLoaded = !!sections[p.id]
          return (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              className="no-drag flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-ink-800/60"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px]',
                  isWalked
                    ? 'bg-glass-accent2/20 text-glass-accent2'
                    : isLoaded
                      ? 'bg-glass-accent/15 text-glass-accent'
                      : 'bg-ink-800 text-ink-600'
                )}
              >
                {isWalked ? '✓' : isBusy ? '·' : i + 1}
              </span>
              <div className="min-w-0">
                <div className={cn('truncate text-[12.5px]', isWalked ? 'text-gray-300' : 'text-gray-200')}>
                  {p.title}
                </div>
                <div className="truncate text-[10.5px] text-ink-600">
                  {isBusy ? 'investigating…' : `${p.files.length} file${p.files.length === 1 ? '' : 's'}`}
                </div>
              </div>
            </button>
          )
        })}
        {plans.length === 0 && <div className="px-2 py-4 text-[12px] text-ink-600">mapping the change…</div>}
      </nav>
    </aside>
  )
}
