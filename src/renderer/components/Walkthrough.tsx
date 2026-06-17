import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useGame } from '../game/store'
import UnderstandingMap from './UnderstandingMap'
import OverviewCard from './OverviewCard'
import SectionCard from './SectionCard'
import ChatPanel from './ChatPanel'
import DepthDial from './DepthDial'
import CoinHud from './CoinHud'
import ReviewCheckout from './ReviewCheckout'
import Arcade from './Arcade'
import Presentation from './Presentation'
import GuidedTour from './GuidedTour'
import { cn } from '../lib/files'

export default function Walkthrough() {
  const overview = useStore((s) => s.overview)
  const diff = useStore((s) => s.diff)
  const walked = useStore((s) => s.walked)
  const back = useStore((s) => s.backToOnboarding)
  const openSettings = useStore((s) => s.openSettings)
  const chatOpen = useStore((s) => s.chatOpen)
  const setChatOpen = useStore((s) => s.setChatOpen)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)

  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)

  const [checkout, setCheckout] = useState(false)
  const [arcade, setArcade] = useState(false)

  const total = overview?.sections.length ?? 0
  const done = overview?.sections.filter((p) => walked.includes(p.id)).length ?? 0
  const allDone = total > 0 && done === total

  useEffect(() => {
    if (allDone) {
      rewardOnce('full_clear', 100, { reason: 'FULL CLEAR!', sound: 'jackpot', confetti: true })
      unlock('full_clear')
    }
  }, [allDone])

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
          <div className="hidden font-mono text-[11.5px] text-ink-600 lg:block">
            {diff.base} → {diff.feature}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <CoinHud />
          <div className="mx-1 h-5 w-px bg-ink-700" />
          <div className="no-drag flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850 p-0.5">
            {(['guided', 'presentation', 'scroll'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={
                  m === 'guided'
                    ? 'Brilliant-style: one idea at a time, interact to advance'
                    : m === 'presentation'
                      ? 'One section at a time'
                      : 'All sections, scroll'
                }
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px] transition-colors',
                  viewMode === m ? 'bg-glass-accent text-ink-950' : 'text-gray-300 hover:text-white'
                )}
              >
                {m === 'guided' ? '🎓 Guided' : m === 'presentation' ? '▭ Present' : '☰ Scroll'}
              </button>
            ))}
          </div>
          <DepthDial />
          <button
            onClick={() => setArcade(true)}
            className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600"
          >
            🕹️
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`no-drag rounded-lg border px-3 py-1.5 text-[12.5px] ${
              chatOpen ? 'border-glass-accent bg-glass-accent/15 text-glass-accent' : 'border-ink-700 text-gray-300 hover:border-ink-600'
            }`}
          >
            💬 Ask
          </button>
          <button
            onClick={() => setCheckout(true)}
            className="no-drag rounded-lg border border-glass-warm/40 bg-glass-warm/10 px-3 py-1.5 text-[12.5px] font-semibold text-glass-warm hover:bg-glass-warm/20"
          >
            🎰 Cash out
          </button>
          <button onClick={() => openSettings(true)} className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600">
            ⚙
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <UnderstandingMap />

        {viewMode === 'guided' ? (
          <GuidedTour onCashout={() => setCheckout(true)} />
        ) : viewMode === 'presentation' ? (
          <Presentation />
        ) : (
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 p-6">
              <OverviewCard />
              {overview?.sections.map((plan, i) => (
                <SectionCard key={plan.id} plan={plan} index={i} />
              ))}
              {overview && (
                <CashoutCta allDone={allDone} done={done} total={total} onClick={() => setCheckout(true)} />
              )}
            </div>
          </main>
        )}

        <ChatPanel />
      </div>

      {checkout && <ReviewCheckout onClose={() => setCheckout(false)} />}
      {arcade && <Arcade onClose={() => setArcade(false)} />}
    </div>
  )
}

function CashoutCta({ allDone, done, total, onClick }: { allDone: boolean; done: number; total: number; onClick: () => void }) {
  return (
    <div className="py-6 text-center">
      <button
        onClick={onClick}
        className="no-drag inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-6 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.02]"
      >
        🎰 {allDone ? 'You cracked it — cash out your verdict' : `Cash out your verdict (${done}/${total} sections explored)`}
      </button>
      <p className="mt-2 text-[12px] text-ink-600">
        Spend the coins you earned to mint your Approve / Request-changes review.
      </p>
    </div>
  )
}
