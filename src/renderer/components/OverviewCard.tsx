import { useStore } from '../store'
import AgentStatus from './AgentStatus'

export default function OverviewCard() {
  const overview = useStore((s) => s.overview)
  const depth = useStore((s) => s.depth)
  const diff = useStore((s) => s.diff)

  return (
    <div className="rounded-xl border border-glass-accent/30 bg-gradient-to-b from-glass-accent/10 to-transparent p-5">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-glass-accent">
        <span>✦</span> The big picture
      </div>

      {!overview ? (
        <div className="mt-3">
          <AgentStatus scope="overview" />
        </div>
      ) : (
        <>
          <h1 className="text-[22px] font-bold leading-tight text-white">{overview.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-200">
            {depth === 'gist' ? overview.whatGist : overview.whatDeep}
          </p>
          <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
            <span className="text-[11px] uppercase tracking-wide text-ink-600">Why</span>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-gray-300">{overview.why}</p>
          </div>
          {overview.highlights.length > 0 && (
            <ul className="mt-3 space-y-1">
              {overview.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] text-gray-200">
                  <span className="text-glass-accent2">›</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
          {diff && (
            <div className="mt-4 flex gap-4 text-[12px] text-ink-600">
              <span>{diff.files.length} files</span>
              <span className="text-glass-add">+{diff.totalAdditions}</span>
              <span className="text-glass-del">−{diff.totalDeletions}</span>
              <span className="font-mono">
                {diff.base} → {diff.feature}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
