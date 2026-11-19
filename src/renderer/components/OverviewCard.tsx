import { useStore } from '../store'
import { useStrings } from '../lib/i18n'
import AgentStatus from './AgentStatus'

export default function OverviewCard() {
  const t = useStrings()
  const overview = useStore((s) => s.overview)
  const depth = useStore((s) => s.depth)
  const diff = useStore((s) => s.diff)
  const primer = overview?.primer

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
          {/* The jargon-free version leads; the fuller wording follows for anyone who wants it. */}
          <p className="mt-2 text-[15px] leading-relaxed text-gray-200">
            {primer?.idea?.trim() || (depth === 'gist' ? overview.whatGist : overview.whatDeep)}
          </p>
          {primer?.idea?.trim() && depth !== 'gist' && overview.whatDeep && (
            <p className="mt-2 text-[14px] leading-relaxed text-gray-400">{overview.whatDeep}</p>
          )}
          {primer?.analogy?.trim() && (
            <div className="mt-3 flex gap-2 rounded-lg border border-glass-accent2/25 bg-glass-accent2/5 p-3">
              <span className="text-[14px] leading-none">💡</span>
              <div>
                <span className="text-[11px] uppercase tracking-wide text-glass-accent2">{t.analogyLabel}</span>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-gray-200">{primer.analogy}</p>
              </div>
            </div>
          )}
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
          {!!primer?.terms?.length && (
            <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <span className="text-[11px] uppercase tracking-wide text-ink-600">{t.termsHeading}</span>
              <dl className="mt-1.5 space-y-1.5">
                {primer.terms.map((term) => (
                  <div key={term.term}>
                    <dt className="font-mono text-[12.5px] font-bold text-glass-warm">{term.term}</dt>
                    <dd className="text-[13px] leading-relaxed text-gray-300">{term.plain}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {diff && (
            <div className="mt-4 flex gap-4 text-[12px] text-ink-600">
              {diff.mode === 'topic' ? (
                <span className="font-mono">🧭 “{diff.topic}” @ {diff.feature}</span>
              ) : (
                <>
                  <span>{diff.files.length} files</span>
                  <span className="text-glass-add">+{diff.totalAdditions}</span>
                  <span className="text-glass-del">−{diff.totalDeletions}</span>
                  <span className="font-mono">
                    {diff.base} → {diff.feature}
                  </span>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
