import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SectionPlan, WalkChunk, WalkthroughSection, TraceableValue } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'
import PokeableCode from './PokeableCode'
import Quiz from './Quiz'
import SelfCheck from './SelfCheck'
import SectionVault from './MiniGame'
import LootChest from './LootChest'
import AgentStatus from './AgentStatus'
import LessonMode from './LessonMode'
import WhyThis from './WhyThis'
import TrailChip from './InvestigationTrail'
import { InsightSlot, buildChallenge, deriveSymbols } from './Insights'

const EMPTY = new Set<number>()

/**
 * A Brilliant-style guided walkthrough: the whole change flattened into a single
 * linear stream of bite-sized "beats", one per screen. You actively recall
 * before each reveal, and the checks (quizzes, insights) gate progress so you
 * can't passively click through. Reuses the same reward keys as the other views
 * so coverage / mastery / loot stay consistent across modes.
 */

type Beat =
  | { kind: 'overview'; key: string }
  | { kind: 'load'; key: string; plan: SectionPlan; sIdx: number }
  | { kind: 'intro'; key: string; plan: SectionPlan; section: WalkthroughSection; sIdx: number }
  | { kind: 'chunk'; key: string; plan: SectionPlan; section: WalkthroughSection; chunk: WalkChunk }
  | { kind: 'insight'; key: string; plan: SectionPlan; section: WalkthroughSection; text: string; i: number }
  | { kind: 'trace'; key: string; plan: SectionPlan; section: WalkthroughSection; value: TraceableValue }
  | { kind: 'selfcheck'; key: string; plan: SectionPlan; section: WalkthroughSection }
  | { kind: 'quiz'; key: string; plan: SectionPlan; section: WalkthroughSection; q: WalkthroughSection['quiz'][number]; qi: number }
  | { kind: 'vault'; key: string; plan: SectionPlan; section: WalkthroughSection }
  | { kind: 'done'; key: string; plan: SectionPlan; section: WalkthroughSection; sIdx: number }
  | { kind: 'finale'; key: string }

/** Mirror SectionVault's playability gate so we don't insert an empty vault beat. */
function vaultPlayable(section: WalkthroughSection): boolean {
  const traces = section.traceableValues ?? []
  const hasOrder = traces.some((v) => v.steps.length >= 3 && v.steps.length <= 6)
  const distinctVals = new Set(
    traces.flatMap((v) => v.steps).filter((s) => s.exampleValue).map((s) => s.exampleValue)
  ).size
  const hasWire = (section.inlineExplanations?.filter((e) => e.gist).length ?? 0) >= 3
  return hasOrder || distinctVals >= 4 || hasWire
}

function buildBeats(
  plans: SectionPlan[],
  sections: Record<string, WalkthroughSection>
): Beat[] {
  const beats: Beat[] = [{ kind: 'overview', key: 'overview' }]
  plans.forEach((plan, sIdx) => {
    const section = sections[plan.id]
    if (!section) {
      beats.push({ kind: 'load', key: `load:${plan.id}`, plan, sIdx })
      return
    }
    beats.push({ kind: 'intro', key: `intro:${plan.id}`, plan, section, sIdx })
    for (const chunk of section.chunks)
      beats.push({ kind: 'chunk', key: `chunk:${plan.id}:${chunk.id}`, plan, section, chunk })
    ;(section.insights ?? []).forEach((text, i) =>
      beats.push({ kind: 'insight', key: `insight:${plan.id}:${i}`, plan, section, text, i })
    )
    for (const value of section.traceableValues ?? [])
      beats.push({ kind: 'trace', key: `trace:${plan.id}:${value.id}`, plan, section, value })
    if (section.selfCheck)
      beats.push({ kind: 'selfcheck', key: `selfcheck:${plan.id}`, plan, section })
    ;(section.quiz ?? []).forEach((q, qi) =>
      beats.push({ kind: 'quiz', key: `quiz:${plan.id}:${q.id}`, plan, section, q, qi })
    )
    if (vaultPlayable(section)) beats.push({ kind: 'vault', key: `vault:${plan.id}`, plan, section })
    beats.push({ kind: 'done', key: `done:${plan.id}`, plan, section, sIdx })
  })
  beats.push({ kind: 'finale', key: 'finale' })
  return beats
}

/** A human-readable description of the current beat, threaded into the Ask chat. */
function describeBeat(beat: Beat): string {
  switch (beat.kind) {
    case 'overview':
    case 'finale':
      return 'The big-picture overview of the whole change.'
    case 'load':
      return `Section "${beat.plan.title}" (still loading).`
    case 'intro':
      return `Section "${beat.section.title}".\nSummary: ${beat.section.plainSummaryGist}`
    case 'chunk':
      return `Section "${beat.section.title}" › code block "${beat.chunk.title}" at ${beat.chunk.file}:${beat.chunk.startLine}-${beat.chunk.endLine}.\nWhat changed there: ${beat.chunk.gist}`
    case 'insight':
      return `Section "${beat.section.title}" › key insight ${beat.i + 1}: ${beat.text}`
    case 'trace':
      return `Section "${beat.plan.title}" › tracing the value "${beat.value.name}" — ${beat.value.description}`
    case 'selfcheck':
      return `Section "${beat.section.title}" › the self-check question.`
    case 'quiz':
      return `Section "${beat.section.title}" › a quiz question: ${beat.q.question}`
    case 'vault':
      return `Section "${beat.section.title}" › the section vault mini-game.`
    case 'done':
      return `Section "${beat.section.title}" (just completed).`
  }
}

export default function GuidedTour({ onCashout, onHunt }: { onCashout: () => void; onHunt: (section: string) => void }) {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const live = useStore((s) => s.live)
  const ensureSection = useStore((s) => s.ensureSection)
  const ensureOverview = useStore((s) => s.ensureOverview)
  const markWalked = useStore((s) => s.markWalked)
  const prefetchNext = useStore((s) => s.settings?.prefetchNext)
  const setChatContext = useStore((s) => s.setChatContext)

  const rewarded = useGame((s) => s.rewarded)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)

  const plans = overview?.sections ?? []
  const beats = useMemo(() => buildBeats(plans, sections), [overview, sections])

  const [pos, setPos] = useState(0)
  const clamped = Math.min(pos, beats.length - 1)
  const beat = beats[clamped]

  // Whether the current beat is "engaged" enough to move on.
  const engaged = (b: Beat): boolean => {
    switch (b.kind) {
      case 'chunk':
        return !!rewarded[`story:${b.chunk.file}:${b.chunk.id}`]
      case 'insight':
        return !!rewarded[`insight:${b.plan.id}:${b.i}`]
      case 'quiz':
        return !!rewarded[`quizsolved:${b.plan.id}:${b.q.id}`]
      case 'load':
        // A section that errored is skippable — user can retry inline or move on.
        return !!live[b.plan.id]?.error
      default:
        return true
    }
  }
  const canAdvance = beat ? engaged(beat) : false
  const isLast = clamped >= beats.length - 1

  // Reveal handler shared by the button and the keyboard. Idempotent.
  // Insights are intentionally excluded — there you pull the slot lever yourself.
  const revealCurrent = () => {
    if (!beat) return
    if (beat.kind === 'chunk')
      rewardOnce(`story:${beat.chunk.file}:${beat.chunk.id}`, 4, { reason: 'dug in', sound: 'reveal' })
  }

  const goNext = () => {
    if (isLast) return
    if (!canAdvance) {
      // A check is blocking — nudge with a reveal where that makes sense.
      if (beat?.kind === 'chunk') revealCurrent()
      return
    }
    play('tick')
    setPos((p) => Math.min(beats.length - 1, p + 1))
  }
  const goBack = () => setPos((p) => Math.max(0, p - 1))

  // Side effects when landing on a beat: lazy-load + section open rewards.
  useEffect(() => {
    if (!beat) return
    if (beat.kind === 'load') {
      ensureSection(beat.plan)
    } else if (beat.kind === 'intro') {
      markWalked(beat.plan.id)
      rewardOnce(`section:open:${beat.plan.id}`, 10, { reason: 'locked in 🔒', sound: 'whoosh' })
      unlock('first_section')
      if (prefetchNext) {
        const np = plans[beat.sIdx + 1]
        if (np) ensureSection(np)
      }
    }
  }, [clamped, beats])

  // Keep the Ask chat anchored to whatever beat you're on, so "this/here" resolves.
  useEffect(() => {
    if (beat) setChatContext(describeBeat(beat))
  }, [clamped, beats])
  useEffect(() => () => setChatContext(null), [])

  // Keyboard nav (ignored while an overlay — chat/arcade/checkout/settings — is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (document.querySelector('[data-overlay]')) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext()
      else if (e.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clamped, beats, canAdvance])

  if (!overview) {
    const overviewLive = live['overview']
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center px-8 pt-14">
        <div className="w-full max-w-md">
          {overviewLive?.error ? (
            <div className="rounded-xl border border-glass-del/30 bg-glass-del/8 p-4">
              <p className="text-[13px] font-semibold text-glass-del">Failed to generate walkthrough</p>
              <p className="mt-1 line-clamp-3 text-[12px] text-ink-600">{overviewLive.error}</p>
              <button
                onClick={ensureOverview}
                className="no-drag mt-3 rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-gray-300 hover:border-ink-500 hover:text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <AgentStatus scope="overview" />
          )}
        </div>
      </div>
    )
  }

  const sectionNo = beat && 'plan' in beat ? plans.findIndex((p) => p.id === beat.plan.id) + 1 : 0
  const pct = beats.length > 1 ? Math.round((clamped / (beats.length - 1)) * 100) : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* progress rail */}
      <div className="flex-none px-6 pt-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-glass-accent to-glass-accent2"
              animate={{ width: `${pct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <span className="w-24 text-right font-mono text-[10.5px] text-ink-600">
            {beat?.kind === 'overview'
              ? 'Big picture'
              : beat?.kind === 'finale'
                ? 'Wrap-up'
                : `Section ${sectionNo}/${plans.length}`}
          </span>
        </div>
      </div>

      {/* beat */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 pb-8 pt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={beat?.key ?? clamped}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
            >
              {beat && <BeatView beat={beat} onCashout={onCashout} onHunt={onHunt} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* nav */}
      <footer className="flex flex-none items-center gap-4 border-t border-ink-800 bg-ink-900/60 px-6 py-3">
        <button
          onClick={goBack}
          disabled={clamped === 0}
          className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-gray-300 hover:border-ink-600 disabled:opacity-30"
        >
          ← Back
        </button>
        <div className="flex-1 text-center text-[11px] text-ink-600">
          {clamped + 1} / {beats.length}
          {!canAdvance && beat?.kind === 'quiz' && <span className="ml-2 text-glass-warm">answer to continue</span>}
          {!canAdvance && beat?.kind === 'chunk' && <span className="ml-2 text-glass-warm">reveal to continue</span>}
          {!canAdvance && beat?.kind === 'insight' && (
            <span className="ml-2 text-glass-warm">pull the lever to continue</span>
          )}
        </div>
        <div className="w-[150px] text-right">
          {isLast ? (
            <span className="text-[12px] text-ink-600">that's everything 🎉</span>
          ) : (
            <button
              onClick={goNext}
              disabled={!canAdvance}
              className={cn(
                'no-drag rounded-lg px-5 py-2 text-[13px] font-semibold transition',
                canAdvance
                  ? 'bg-glass-accent text-ink-950 hover:brightness-110'
                  : 'cursor-not-allowed bg-ink-800 text-ink-600'
              )}
            >
              {beat?.kind === 'overview' ? 'Start →' : 'Next →'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Beat renderers
// ---------------------------------------------------------------------------

function BeatView({ beat, onCashout, onHunt }: { beat: Beat; onCashout: () => void; onHunt: (section: string) => void }) {
  switch (beat.kind) {
    case 'overview':
      return <OverviewBeat />
    case 'load':
      return <LoadBeat plan={beat.plan} sIdx={beat.sIdx} />
    case 'intro':
      return <IntroBeat plan={beat.plan} section={beat.section} sIdx={beat.sIdx} />
    case 'chunk':
      return <ChunkBeat plan={beat.plan} section={beat.section} chunk={beat.chunk} onHunt={onHunt} />
    case 'insight':
      return <InsightBeat plan={beat.plan} section={beat.section} text={beat.text} i={beat.i} />
    case 'trace':
      return <TraceBeat plan={beat.plan} section={beat.section} value={beat.value} />
    case 'selfcheck':
      return <SelfCheck check={beat.section.selfCheck!} sectionId={beat.plan.id} />
    case 'quiz':
      return <Quiz q={beat.q} sectionId={beat.plan.id} index={beat.qi} />
    case 'vault':
      return <SectionVault section={beat.section} sectionId={beat.plan.id} />
    case 'done':
      return <DoneBeat plan={beat.plan} section={beat.section} sIdx={beat.sIdx} />
    case 'finale':
      return <FinaleBeat onCashout={onCashout} />
  }
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-glass-accent">{children}</div>
}

function OverviewBeat() {
  const overview = useStore((s) => s.overview)!
  const depth = useStore((s) => s.depth)
  const diff = useStore((s) => s.diff)
  return (
    <div>
      <Eyebrow>✦ Big picture</Eyebrow>
      <h1 className="text-[26px] font-bold leading-tight text-white">{overview.title}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-gray-200">
        {depth === 'gist' ? overview.whatGist : overview.whatDeep}
      </p>
      <div className="mt-4 rounded-xl border border-glass-accent/25 bg-glass-accent/5 p-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-glass-accent">Why</span>
        <p className="mt-1 text-[14px] leading-relaxed text-gray-200">{overview.why}</p>
      </div>
      {overview.highlights?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {overview.highlights.map((h, i) => (
            <li key={i} className="flex gap-2 text-[14px] text-gray-200">
              <span className="text-glass-accent2">▹</span>
              {h}
            </li>
          ))}
        </ul>
      )}
      {diff && (
        <div className="mt-5 flex flex-wrap items-center gap-4 text-[12px] text-ink-600">
          <span>{diff.files.length} files</span>
          <span className="text-glass-add">+{diff.totalAdditions}</span>
          <span className="text-glass-del">−{diff.totalDeletions}</span>
          <span className="font-mono">
            {diff.base} → {diff.feature}
          </span>
        </div>
      )}
      <p className="mt-6 text-[13px] text-ink-600">
        {overview.sections.length} sections ahead — press <kbd className="rounded bg-ink-800 px-1.5 py-0.5">→</kbd> to begin
      </p>
    </div>
  )
}

function LoadBeat({ plan, sIdx }: { plan: SectionPlan; sIdx: number }) {
  const live = useStore((s) => s.live[plan.id])
  const retrySection = useStore((s) => s.retrySection)

  return (
    <div>
      <Eyebrow>Section {sIdx + 1}</Eyebrow>
      <h1 className="text-[24px] font-bold text-white">{plan.title}</h1>
      <p className="mt-2 text-[14px] text-ink-600">{plan.teaser}</p>
      <div className="mt-6">
        {live?.error && !live.busy ? (
          <div className="rounded-xl border border-glass-del/30 bg-glass-del/8 p-3">
            <p className="flex items-center gap-2 text-[12.5px] text-glass-del">
              <span>⚠</span>
              <span className="line-clamp-2">{live.error}</span>
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <button
                onClick={() => retrySection(plan)}
                className="no-drag rounded border border-ink-700 px-2.5 py-1 text-[11.5px] text-gray-300 hover:border-ink-500 hover:text-white"
              >
                Retry
              </button>
              <span className="text-[10.5px] text-ink-600">or press → to skip this section</span>
            </div>
          </div>
        ) : (
          <AgentStatus scope={plan.id} />
        )}
      </div>
    </div>
  )
}

function IntroBeat({ plan, section, sIdx }: { plan: SectionPlan; section: WalkthroughSection; sIdx: number }) {
  const depth = useStore((s) => s.depth)
  return (
    <div>
      <Eyebrow>Section {sIdx + 1}</Eyebrow>
      <h1 className="text-[24px] font-bold leading-tight text-white">{section.title}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-gray-200">
        {depth === 'gist' ? section.plainSummaryGist : section.plainSummaryDeep}
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-ink-600">
        {section.chunks.length > 0 && <Pill>{section.chunks.length} code blocks</Pill>}
        {(section.insights?.length ?? 0) > 0 && <Pill>💡 {section.insights.length} insights</Pill>}
        {(section.quiz?.length ?? 0) > 0 && <Pill>🧠 {section.quiz.length} quizzes</Pill>}
        {(section.traceableValues?.length ?? 0) > 0 && <Pill>🎬 {section.traceableValues.length} traces</Pill>}
      </div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1">{children}</span>
}

const CHANGE_META: Record<string, { label: string; cls: string }> = {
  added: { label: 'ADDED', cls: 'bg-glass-add/15 text-glass-add' },
  modified: { label: 'CHANGED', cls: 'bg-glass-accent/15 text-glass-accent' },
  removed: { label: 'REMOVED', cls: 'bg-glass-del/15 text-glass-del' }
}

/** Active recall: see the code, take a guess, THEN reveal what it does. */
function ChunkBeat({ plan, section, chunk, onHunt }: { plan: SectionPlan; section: WalkthroughSection; chunk: WalkChunk; onHunt: (section: string) => void }) {
  const rewarded = useGame((s) => s.rewarded)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const diff = useStore((s) => s.diff)
  const revealed = !!rewarded[`story:${chunk.file}:${chunk.id}`]
  const meta = CHANGE_META[chunk.changeKind] ?? CHANGE_META.modified
  const file = diff?.files.find((f) => f.path === chunk.file || f.oldPath === chunk.file)
  const huntable = (section.reviewFindings?.length ?? 0) > 0

  const [lessonOpen, setLessonOpen] = useState(false)

  const reveal = () =>
    rewardOnce(`story:${chunk.file}:${chunk.id}`, 4, { reason: 'dug in', sound: 'reveal' })

  return (
    <div>
      <Eyebrow>
        <span className={cn('mr-2 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider', meta.cls)}>{meta.label}</span>
        {chunk.file}:{chunk.startLine}
      </Eyebrow>
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 text-[20px] font-bold text-white">{chunk.title}</h1>
        {file && (
          <span className="mt-1 flex-none font-mono text-[11px]">
            <span className="text-glass-add">+{file.additions}</span>{' '}
            <span className="text-glass-del">−{file.deletions}</span>
          </span>
        )}
        <button
          onClick={() => setLessonOpen(true)}
          title="Lesson Mode — step through this block one idea at a time"
          className="no-drag mt-0.5 flex-none rounded-lg bg-glass-accent2/15 px-3 py-1 text-[12px] font-medium text-glass-accent2 hover:bg-glass-accent2/25"
        >
          ▶ Learn
        </button>
        {huntable && (
          <button
            onClick={() => onHunt(plan.id)}
            title="Bug Hunt — can you spot what a reviewer would flag in this section?"
            className="no-drag mt-0.5 flex-none rounded-lg bg-glass-del/15 px-3 py-1 text-[12px] font-medium text-glass-del hover:bg-glass-del/25"
          >
            🚩 Flag
          </button>
        )}
      </div>

      {lessonOpen && (
        <LessonMode chunk={chunk} explanations={section.inlineExplanations} onClose={() => setLessonOpen(false)} />
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
        <PokeableCode
          file={chunk.file}
          startLine={chunk.startLine}
          endLine={chunk.endLine}
          explanations={section.inlineExplanations}
          traceLines={EMPTY}
          activeLine={null}
        />
      </div>

      {!revealed ? (
        <div className="mt-5 rounded-xl border border-dashed border-glass-accent/40 bg-glass-accent/5 p-5 text-center">
          <p className="text-[14px] text-gray-200">🤔 Before you peek — what do you think this block does?</p>
          <button
            onClick={reveal}
            className="no-drag mt-3 rounded-lg bg-glass-accent px-5 py-2 text-[13.5px] font-semibold text-ink-950 hover:brightness-110"
          >
            Reveal what it does · +4🪙
          </button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-3">
          <p className="text-[15px] leading-relaxed text-gray-100">{chunk.gist}</p>
          <Field label="What it does" text={chunk.story.what} />
          <Field label="How it fits" text={chunk.story.fits} />
          {chunk.story.calledBy && chunk.story.calledBy.toLowerCase() !== 'n/a' && (
            <Field label="What calls it" text={chunk.story.calledBy} />
          )}
          {chunk.story.gotcha && (
            <div className="rounded-md border border-glass-warm/30 bg-glass-warm/5 p-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-glass-warm">⚠ Gotcha: </span>
              <span className="text-[14px] text-gray-200">{chunk.story.gotcha}</span>
            </div>
          )}
        </motion.div>
      )}

      <div className="mt-4 border-t border-ink-800 pt-3">
        <WhyThis context={`${chunk.title} (${chunk.file}:${chunk.startLine}-${chunk.endLine}). ${chunk.gist}. ${chunk.story.what}`} />
      </div>
    </div>
  )
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div className="text-[14px] leading-relaxed">
      <span className="text-[11px] uppercase tracking-wide text-ink-600">{label}: </span>
      <span className="text-gray-200">{text}</span>
    </div>
  )
}

/**
 * Insight as a slot machine: pull the lever to reveal the "aha", then lock in the
 * jackpot by filling the blank. Shares the exact reward keys + comprehension
 * mechanic as the scroll/presentation views (the `InsightSlot` component).
 */
function InsightBeat({ plan, section, text, i }: { plan: SectionPlan; section: WalkthroughSection; text: string; i: number }) {
  const symbols = useMemo(() => deriveSymbols(section.inlineExplanations), [section.inlineExplanations])
  const challenge = useMemo(
    () => buildChallenge(text, symbols, section.insights ?? [], i),
    [text, symbols, section.insights, i]
  )

  return (
    <div>
      <Eyebrow>💡 Key insight {i + 1}</Eyebrow>
      <p className="mb-3 text-[14px] text-gray-300">There's an "aha" hiding here — pull the lever to surface it, then lock it in.</p>
      <InsightSlot
        text={text}
        challenge={challenge}
        revealKey={`insight:${plan.id}:${i}`}
        lockKey={`insightlock:${plan.id}:${i}`}
      />
    </div>
  )
}

/** Watch a value flow through the change, one step at a time — synced to the code. */
function TraceBeat({ plan, section, value }: { plan: SectionPlan; section: WalkthroughSection; value: TraceableValue }) {
  const rewardOnce = useGame((s) => s.rewardOnce)
  const [i, setI] = useState(0)
  const steps = value.steps
  const atEnd = i >= steps.length - 1
  const cur = steps[i]

  // Code window for the active step's file: spans that file's step lines (padded),
  // clamped to a focused window if the steps are scattered far apart.
  const win = useMemo(() => {
    const nums = steps.filter((s) => s.file === cur.file).map((s) => s.line)
    let lo = Math.max(1, Math.min(...nums) - 2)
    let hi = Math.max(...nums) + 2
    if (hi - lo > 40) {
      lo = Math.max(1, cur.line - 4)
      hi = cur.line + 5
    }
    return { startLine: lo, endLine: hi, traceLines: new Set(nums) }
  }, [cur.file, cur.line, steps])

  const step = (n: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, n))
    setI(next)
    if (next === steps.length - 1)
      rewardOnce(`trace:${plan.id}:${value.id}`, 15, { reason: 'traced it!', sound: 'coin', confetti: true })
    else play('tick')
  }

  return (
    <div>
      <Eyebrow>🎬 Trace · {value.name}</Eyebrow>
      <p className="text-[14px] leading-relaxed text-gray-200">{value.description}</p>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 bg-ink-850 px-3 py-1.5 font-mono text-[10.5px] text-ink-600">
          {cur.file}
        </div>
        <PokeableCode
          file={cur.file}
          startLine={win.startLine}
          endLine={win.endLine}
          explanations={section.inlineExplanations}
          traceLines={win.traceLines}
          activeLine={cur.line}
        />
      </div>

      <div className="mt-4 space-y-2">
        {steps.map((s, idx) => {
          const active = idx === i
          const past = idx < i
          return (
            <motion.div
              key={idx}
              animate={{ opacity: active ? 1 : past ? 0.6 : 0.3, scale: active ? 1 : 0.99 }}
              className={cn(
                'rounded-lg border p-3',
                active ? 'border-glass-accent bg-glass-accent/10' : 'border-ink-700 bg-ink-900'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold',
                    active || past ? 'bg-glass-accent text-ink-950' : 'bg-ink-800 text-ink-600'
                  )}
                >
                  {past ? '✓' : idx + 1}
                </span>
                <span className="text-[13.5px] text-gray-100">{s.label}</span>
                <span className="ml-auto font-mono text-[10.5px] text-ink-600">
                  {s.file}:{s.line}
                </span>
              </div>
              {active && s.exampleValue && (
                <div className="mt-2 rounded bg-ink-950 px-2 py-1 font-mono text-[12px] text-glass-accent2">
                  = {s.exampleValue}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => step(i - 1)}
          disabled={i === 0}
          className="no-drag rounded-lg border border-ink-700 px-3 py-1.5 text-[12.5px] text-gray-300 disabled:opacity-30"
        >
          ◄ Prev step
        </button>
        <button
          onClick={() => step(i + 1)}
          disabled={atEnd}
          className="no-drag rounded-lg bg-glass-accent px-4 py-1.5 text-[12.5px] font-semibold text-ink-950 hover:brightness-110 disabled:opacity-40"
        >
          Step ►
        </button>
        <span className="ml-auto text-[11px] text-ink-600">
          {atEnd ? 'flow complete ✓' : `step ${i + 1}/${steps.length}`}
        </span>
      </div>
    </div>
  )
}

function DoneBeat({ plan, section, sIdx }: { plan: SectionPlan; section: WalkthroughSection; sIdx: number }) {
  return (
    <div className="text-center">
      <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} className="text-[56px]">
        🎉
      </motion.div>
      <h1 className="mt-2 text-[22px] font-bold text-white">Section {sIdx + 1} cracked</h1>
      <p className="mt-1 text-[14px] text-ink-600">You understood “{section.title}” end to end.</p>
      <div className="mt-5 text-left">
        <LootChest
          sectionId={plan.id}
          insightCount={section.insights?.length ?? 0}
          quizIds={(section.quiz ?? []).map((q) => q.id)}
          hasSelfCheck={!!section.selfCheck}
        />
        <TrailChip trail={section.investigationTrail} />
      </div>
    </div>
  )
}

function FinaleBeat({ onCashout }: { onCashout: () => void }) {
  return (
    <div className="py-6 text-center">
      <motion.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        className="text-[64px]"
      >
        🔮
      </motion.div>
      <h1 className="mt-3 text-[26px] font-black text-white">You understood the whole change.</h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-600">
        Every block, every value, every gotcha — in your head, not just skimmed. Now cash out the coins you earned to mint
        your verdict.
      </p>
      <button
        onClick={onCashout}
        className="no-drag mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-7 py-3.5 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.03]"
      >
        🎰 Cash out your verdict
      </button>
    </div>
  )
}
