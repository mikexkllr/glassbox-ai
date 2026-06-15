import { useStore } from '../store'
import { cn } from '../lib/files'

/** Explain-depth dial: one-line gist ⇄ deep dive. (Deeper-still is on-demand per item.) */
export default function DepthDial() {
  const depth = useStore((s) => s.depth)
  const setDepth = useStore((s) => s.setDepth)

  return (
    <div className="no-drag flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850 p-0.5">
      <span className="px-1.5 text-[10px] uppercase tracking-wide text-ink-600">depth</span>
      {(['gist', 'deep'] as const).map((d) => (
        <button
          key={d}
          onClick={() => setDepth(d)}
          className={cn(
            'rounded-full px-3 py-1 text-[12px] capitalize transition-colors',
            depth === d ? 'bg-glass-accent text-ink-950' : 'text-gray-300 hover:text-white'
          )}
        >
          {d}
        </button>
      ))}
    </div>
  )
}
