import { useStore } from '../store'
import UnderstandingMap from './UnderstandingMap'
import OverviewCard from './OverviewCard'
import SectionCard from './SectionCard'
import ChatPanel from './ChatPanel'
import DepthDial from './DepthDial'

export default function Walkthrough() {
  const overview = useStore((s) => s.overview)
  const diff = useStore((s) => s.diff)
  const back = useStore((s) => s.backToOnboarding)
  const openSettings = useStore((s) => s.openSettings)
  const chatOpen = useStore((s) => s.chatOpen)
  const setChatOpen = useStore((s) => s.setChatOpen)

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="drag flex h-12 flex-none items-center gap-3 border-b border-ink-800 px-4">
        <div className="w-16" /> {/* space for macOS traffic lights */}
        <button onClick={back} className="no-drag text-[13px] text-ink-600 hover:text-white">
          ← repos
        </button>
        <div className="text-[13px] font-medium text-white">Glassbox</div>
        {diff && (
          <div className="font-mono text-[11.5px] text-ink-600">
            {diff.base} → {diff.feature}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DepthDial />
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`no-drag rounded-lg border px-3 py-1.5 text-[12.5px] ${
              chatOpen ? 'border-glass-accent bg-glass-accent/15 text-glass-accent' : 'border-ink-700 text-gray-300 hover:border-ink-600'
            }`}
          >
            💬 Ask
          </button>
          <button onClick={() => openSettings(true)} className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600">
            ⚙
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <UnderstandingMap />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 p-6">
            <OverviewCard />
            {overview?.sections.map((plan, i) => (
              <SectionCard key={plan.id} plan={plan} index={i} />
            ))}
            {overview && (
              <p className="py-6 text-center text-[12px] text-ink-600">
                That's the whole change. Poke any symbol, trace a value, or ask a question.
              </p>
            )}
          </div>
        </main>

        <ChatPanel />
      </div>
    </div>
  )
}
