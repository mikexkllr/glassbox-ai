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
import BlastRadius from './BlastRadius'
import BossFight from './BossFight'
import PRWrapped from './PRWrapped'
import Mascot from './Mascot'
import DataFlow from './DataFlow'
import { cn } from '../lib/files'

export default function Walkthrough() {
  const overview = useStore((s) => s.overview)
  const diff = useStore((s) => s.diff)
  const walked = useStore((s) => s.walked)
  const back = useStore((s) => s.backToOnboarding)
  const regenerate = useStore((s) => s.regenerate)
  const resetAll = useStore((s) => s.resetAll)
  const openSettings = useStore((s) => s.openSettings)
  const chatOpen = useStore((s) => s.chatOpen)
  const setChatOpen = useStore((s) => s.setChatOpen)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)

  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)
  const resetProfile = useGame((s) => s.resetProfile)

  const [checkout, setCheckout] = useState(false)
  const [arcade, setArcade] = useState(false)
  const [map, setMap] = useState(false)
  const [flow, setFlow] = useState(false)
  const [boss, setBoss] = useState(false)
  const [wrapped, setWrapped] = useState(false)
  const [confirm, setConfirm] = useState<null | 'regenerate' | 'reset'>(null)
  const isMac = window.glassbox.platform === 'darwin'

  // Cashing out now leads through the "PR Wrapped" recap, which then mints the verdict.
  const openCashout = () => setWrapped(true)

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
      <header
        className="drag flex h-12 flex-none items-center gap-3 border-b border-ink-800 px-4"
        // On Windows/Linux reserve room on the right for the native window controls
        // (overlay); resolves to a no-op 16px on macOS, which has no overlay env var.
        style={{ paddingRight: 'calc(16px + 100% - env(titlebar-area-width, 100%))' }}
      >
        {isMac && <div className="w-16" />} {/* space for macOS traffic lights */}
        <button onClick={back} className="no-drag text-[13px] text-ink-600 hover:text-white">
          ← repos
        </button>
        <button
          onClick={() => setConfirm('regenerate')}
          title="Regenerate this walkthrough with AI"
          className="no-drag rounded-lg border border-ink-700 px-2 py-1 text-[12.5px] text-gray-300 hover:border-ink-600"
        >
          🔄
        </button>
        <button
          onClick={() => setConfirm('reset')}
          title="Reset — wipe your progress and this walkthrough"
          className="no-drag rounded-lg border border-ink-700 px-2 py-1 text-[12.5px] text-gray-300 hover:border-glass-del/60"
        >
          🧹
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
            onClick={() => setMap(true)}
            title="Blast radius — fog-of-war map of the diff"
            className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600"
          >
            🗺️
          </button>
          <button
            onClick={() => setFlow(true)}
            title="Data flow — watch values move through the change"
            className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600"
          >
            🌊
          </button>
          <button
            onClick={() => setArcade(true)}
            title="Arcade — games, shop, slots, quests"
            className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-ink-600"
          >
            🕹️
          </button>
          <button
            onClick={() => setBoss(true)}
            title="Boss Fight — the recall gauntlet capstone"
            className="no-drag rounded-lg border border-glass-del/40 px-3 py-1.5 text-[12.5px] text-gray-300 hover:border-glass-del/70"
          >
            ⚔️
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
            onClick={openCashout}
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
          <GuidedTour onCashout={openCashout} />
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
                <CashoutCta allDone={allDone} done={done} total={total} onClick={openCashout} />
              )}
            </div>
          </main>
        )}

        <ChatPanel />
      </div>

      {checkout && <ReviewCheckout onClose={() => setCheckout(false)} />}
      {arcade && <Arcade onClose={() => setArcade(false)} />}
      {map && <BlastRadius onClose={() => setMap(false)} />}
      {flow && <DataFlow onClose={() => setFlow(false)} />}
      {boss && <BossFight onClose={() => setBoss(false)} onCashout={() => { setBoss(false); openCashout() }} />}
      {wrapped && (
        <PRWrapped
          onProceed={() => { setWrapped(false); setCheckout(true) }}
          onClose={() => setWrapped(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          kind={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const k = confirm
            setConfirm(null)
            if (k === 'regenerate') {
              void regenerate()
            } else {
              resetProfile()
              resetAll()
            }
          }}
        />
      )}
      <Mascot />
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

function ConfirmDialog({
  kind,
  onCancel,
  onConfirm
}: {
  kind: 'regenerate' | 'reset'
  onCancel: () => void
  onConfirm: () => void
}) {
  const isReset = kind === 'reset'
  return (
    <div data-overlay className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70 p-6" onClick={onCancel}>
      <div className="w-[420px] max-w-full rounded-2xl border border-ink-700 bg-ink-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-bold text-white">{isReset ? '🧹 Reset everything?' : '🔄 Regenerate walkthrough?'}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-300">
          {isReset
            ? 'This wipes your game progress — coins, XP, level, streak, achievements, cosmetics, reviews — AND the cached walkthrough, then sends you back to the start. This cannot be undone.'
            : 'This discards the current AI overview and sections and re-runs the agent on these branches. Your coins and progress stay.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-gray-300 hover:border-ink-600">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'no-drag rounded-lg px-4 py-2 text-[13px] font-bold',
              isReset ? 'bg-glass-del text-white hover:brightness-110' : 'bg-glass-accent text-ink-950 hover:brightness-110'
            )}
          >
            {isReset ? 'Reset everything' : 'Regenerate'}
          </button>
        </div>
      </div>
    </div>
  )
}
