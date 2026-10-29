import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useGame } from '../game/store'
import UnderstandingMap from './UnderstandingMap'
import OverviewCard from './OverviewCard'
import ArchRecon from './ArchRecon'
import SectionCard from './SectionCard'
import ChatPanel from './ChatPanel'
import DepthDial from './DepthDial'
import CoinHud from './CoinHud'
import ReviewCheckout from './ReviewCheckout'
import Arcade from './Arcade'
import Presentation from './Presentation'
import LearnPath from './LearnPath'
import LessonPlayer, { type LessonRef } from './lesson/LessonPlayer'
import BlastRadius from './BlastRadius'
import BossFight from './BossFight'
import BugHunt from './BugHunt'
import PRWrapped from './PRWrapped'
import DataFlow from './DataFlow'
import GoldenBug from './GoldenBug'
import { cn } from '../lib/files'

const VIEW_LABEL = {
  guided: { label: '🎓 Learn', title: 'Lessons: predict, check, repeat — one idea per screen' },
  presentation: { label: '▭ Slides', title: 'One section at a time' },
  scroll: { label: '☰ Read', title: 'Everything on one page, for reference' }
} as const

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

  const [lesson, setLesson] = useState<LessonRef | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [arcade, setArcade] = useState(false)
  const [map, setMap] = useState(false)
  const [flow, setFlow] = useState(false)
  const [boss, setBoss] = useState(false)
  const [hunt, setHunt] = useState<null | { section?: string }>(null)
  const [wrapped, setWrapped] = useState(false)
  const [confirm, setConfirm] = useState<null | 'regenerate' | 'reset'>(null)
  const isMac = window.glassbox.platform === 'darwin'
  // Topic journeys explore existing code — there's no diff to map and no PR verdict to mint.
  const topicMode = diff?.mode === 'topic'
  const learn = viewMode === 'guided'

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
        <div className="h-5 w-px bg-ink-800" />
        <div className="text-[13px] font-semibold text-white">Glassbox</div>
        {diff && (
          <div className="hidden max-w-[300px] truncate font-mono text-[11.5px] text-ink-600 xl:block">
            {diff.mode === 'topic' ? <>🧭 “{diff.topic}”</> : <>{diff.base} → {diff.feature}</>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="no-drag flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850 p-0.5">
            {(['guided', 'presentation', 'scroll'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={VIEW_LABEL[m].title}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px] transition-colors',
                  viewMode === m ? 'bg-glass-accent2 font-semibold text-ink-950' : 'text-gray-300 hover:text-white'
                )}
              >
                {VIEW_LABEL[m].label}
              </button>
            ))}
          </div>
          {!learn && <DepthDial />}
          <div className="mx-1 h-5 w-px bg-ink-700" />
          <CoinHud />
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              'no-drag rounded-lg border px-3 py-1.5 text-[12.5px]',
              chatOpen ? 'border-glass-accent bg-glass-accent/15 text-glass-accent' : 'border-ink-700 text-gray-300 hover:border-ink-600'
            )}
          >
            💬 Ask
          </button>
          <MoreMenu
            topicMode={topicMode}
            onHunt={() => setHunt({})}
            onBoss={() => setBoss(true)}
            onArcade={() => setArcade(true)}
            onMap={() => setMap(true)}
            onFlow={() => setFlow(true)}
            onCashout={openCashout}
            onRegenerate={() => setConfirm('regenerate')}
            onReset={() => setConfirm('reset')}
            onSettings={() => openSettings(true)}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {learn ? (
          <LearnPath
            onStart={setLesson}
            onCashout={openCashout}
            onHunt={() => setHunt({})}
            onBoss={() => setBoss(true)}
            onArcade={() => setArcade(true)}
            onMap={() => setMap(true)}
            onFlow={() => setFlow(true)}
          />
        ) : (
          <>
            <UnderstandingMap />
            {viewMode === 'presentation' ? (
              <Presentation />
            ) : (
              <main className="min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl space-y-4 p-6">
                  <OverviewCard />
                  <ArchRecon />
                  {overview?.sections.map((plan, i) => (
                    <SectionCard key={plan.id} plan={plan} index={i} />
                  ))}
                  {overview && !topicMode && (
                    <CashoutCta allDone={allDone} done={done} total={total} onClick={openCashout} />
                  )}
                </div>
              </main>
            )}
          </>
        )}

        <ChatPanel />
      </div>

      {lesson && (
        <LessonPlayer
          key={lesson.kind === 'section' ? lesson.planId : lesson.kind}
          lesson={lesson}
          onExit={() => setLesson(null)}
          onHunt={(section) => {
            setLesson(null)
            setHunt({ section })
          }}
        />
      )}
      {checkout && <ReviewCheckout onClose={() => setCheckout(false)} />}
      {arcade && <Arcade onClose={() => setArcade(false)} />}
      {map && <BlastRadius onClose={() => setMap(false)} />}
      {flow && <DataFlow onClose={() => setFlow(false)} />}
      {boss && <BossFight onClose={() => setBoss(false)} onCashout={() => { setBoss(false); openCashout() }} />}
      {hunt && <BugHunt onClose={() => setHunt(null)} focusSectionId={hunt.section} />}
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
      {/* The golden bug is an Arcade side-quest — never let it scuttle across a lesson. */}
      {!learn && <GoldenBug />}
    </div>
  )
}

/** Everything that isn't the lesson loop lives here, so the top bar stays calm. */
function MoreMenu({
  topicMode,
  onHunt,
  onBoss,
  onArcade,
  onMap,
  onFlow,
  onCashout,
  onRegenerate,
  onReset,
  onSettings
}: {
  topicMode: boolean
  onHunt: () => void
  onBoss: () => void
  onArcade: () => void
  onMap: () => void
  onFlow: () => void
  onCashout: () => void
  onRegenerate: () => void
  onReset: () => void
  onSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const sfxOn = useGame((s) => s.sfxOn)
  const toggleSfx = useGame((s) => s.toggleSfx)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const item = (icon: string, label: string, run: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => {
        setOpen(false)
        run()
      }}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ink-800',
        danger ? 'text-glass-del' : 'text-gray-200'
      )}
    >
      <span className="w-5 text-center">{icon}</span>
      {label}
    </button>
  )

  return (
    <div ref={ref} className="no-drag relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="More"
        className={cn(
          'rounded-lg border px-2.5 py-1.5 text-[13px] leading-none',
          open ? 'border-glass-accent2/60 text-white' : 'border-ink-700 text-gray-300 hover:border-ink-600'
        )}
      >
        •••
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[120] w-60 rounded-xl border border-ink-700 bg-ink-900 p-1.5 shadow-2xl">
          <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-600">Practice</div>
          {item('🐛', 'Bug Hunt', onHunt)}
          {item('⚔️', 'Boss Fight', onBoss)}
          {!topicMode && item('🗺️', 'Blast radius', onMap)}
          {item('🌊', 'Data flow', onFlow)}
          {item('🕹️', 'Arcade', onArcade)}
          {!topicMode && item('🏁', 'Mint your verdict', onCashout)}
          <div className="my-1 h-px bg-ink-800" />
          {item(sfxOn ? '🔊' : '🔇', sfxOn ? 'Sound on' : 'Sound off', toggleSfx)}
          {item('⚙', 'Settings', onSettings)}
          <div className="my-1 h-px bg-ink-800" />
          {item('🔄', 'Regenerate walkthrough', onRegenerate)}
          {item('🧹', 'Reset everything', onReset, true)}
        </div>
      )}
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
            : 'This discards the current AI overview and sections and re-runs the agent on these branches. Your coins, XP and achievements stay — but the new sections start unplayed, so this walkthrough’s quizzes, vaults and chests reset.'}
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
