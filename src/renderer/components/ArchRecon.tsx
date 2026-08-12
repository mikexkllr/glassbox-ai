import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ArchFacet, ArchQuestion, DiffSummary, Overview } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

/**
 * Architecture Recon — the guess-first warm-up that runs before any section.
 *
 * You commit to a mental model of the system at 10,000 feet (how big is this,
 * where does the weight sit, what happens in what order, what shape is the core
 * data) BEFORE reading a line of it — so the walkthrough lands as a correction
 * to a real model instead of as facts about code you haven't met yet.
 *
 * Two rounds are derived from the diff itself and always work; the rest come
 * from the agent's `overview.archChallenge`, so a cached pre-recon session
 * simply plays the deterministic ones (or none, for a topic journey).
 */

/** Marked once every round is finished — the guided tour gates its beat on this. */
export const ARCH_DONE_KEY = 'arch:done'

export interface OrderItem {
  id: string
  primary: string
  secondary?: string
}

export type ArchRound =
  | { kind: 'scale'; key: string; options: string[]; correctIndex: number; detail: string }
  | { kind: 'order'; key: string; title: string; prompt: string; items: OrderItem[]; reward: number }
  | { kind: 'quiz'; key: string; q: ArchQuestion }

const FILE_LADDER: Array<[number, number]> = [
  [1, 2],
  [3, 5],
  [6, 10],
  [11, 20],
  [21, 50],
  [51, Infinity]
]

function bucketLabel([lo, hi]: [number, number]): string {
  if (hi === Infinity) return `${lo}+ files`
  return lo === hi ? `${lo} file` : `${lo}–${hi} files`
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** The rounds available for this journey, in play order. Empty = nothing to play. */
export function buildArchRounds(overview: Overview | null, diff: DiffSummary | null): ArchRound[] {
  if (!overview) return []
  const rounds: ArchRound[] = []
  // A topic journey snapshots the repo at one commit — there's no diff to size up.
  const files = diff && diff.mode !== 'topic' ? diff.files : []

  if (files.length > 0) {
    const truth = FILE_LADDER.findIndex(([lo, hi]) => files.length >= lo && files.length <= hi)
    const start = Math.max(0, Math.min(FILE_LADDER.length - 4, truth - 1))
    rounds.push({
      kind: 'scale',
      key: 'arch:scale',
      options: FILE_LADDER.slice(start, start + 4).map(bucketLabel),
      correctIndex: truth - start,
      detail: `${files.length} ${files.length === 1 ? 'file' : 'files'} · +${diff!.totalAdditions} −${diff!.totalDeletions}`
    })
  }

  // Rank the hot spots by churn. Only the strictly-decreasing prefix is used —
  // two files with equal churn have no single right order to guess.
  const byChurn = files
    .filter((f) => !f.binary)
    .map((f) => ({ path: f.path, churn: f.additions + f.deletions }))
    .sort((a, b) => b.churn - a.churn)
  const hotspots: typeof byChurn = []
  for (const f of byChurn) {
    if (hotspots.length === 4 || (hotspots.length > 0 && hotspots[hotspots.length - 1].churn === f.churn)) break
    hotspots.push(f)
  }
  if (hotspots.length >= 3) {
    rounds.push({
      kind: 'order',
      key: 'arch:hotspots',
      title: '🔥 Where does the weight land?',
      prompt: 'Rank these files by how much of the change lives in them — heaviest first.',
      items: hotspots.map((f) => ({
        id: f.path,
        primary: f.path.split('/').pop() ?? f.path,
        secondary: f.path.split('/').slice(0, -1).join('/')
      })),
      reward: 20
    })
  }

  const arch = overview.archChallenge
  const stages = arch?.stages ?? []
  if (stages.length >= 3) {
    rounds.push({
      kind: 'order',
      key: 'arch:order',
      title: '🔀 What happens in what order?',
      // Leading, not wrapping: a long flowLabel would otherwise push the verb
      // ("…back in order") a whole line away from what it applies to.
      prompt: arch?.flowLabel ? `Back in order: ${arch.flowLabel}.` : 'Put the main flow back in order.',
      items: stages.map((s, i) => ({ id: `stage-${i}`, primary: s })),
      reward: 25
    })
  }

  for (const q of arch?.questions ?? []) {
    // A malformed index would make the question unanswerable — and the guided
    // tour won't let you past the recon until every round is done.
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) continue
    rounds.push({ kind: 'quiz', key: `arch:q:${q.id}`, q })
  }

  return rounds
}

const FACET_META: Record<ArchFacet, { label: string; emoji: string }> = {
  shape: { label: 'Shape', emoji: '🏗' },
  data: { label: 'Data', emoji: '🧱' },
  flow: { label: 'Flow', emoji: '🔀' },
  boundary: { label: 'Boundary', emoji: '🧭' },
  risk: { label: 'Risk', emoji: '⚠️' }
}

export default function ArchRecon() {
  const overview = useStore((s) => s.overview)
  const diff = useStore((s) => s.diff)
  const rounds = useMemo(() => buildArchRounds(overview, diff), [overview, diff])

  const rewarded = useGame((s) => s.rewarded)
  const mark = useGame((s) => s.mark)
  const unlock = useGame((s) => s.unlock)

  // Where the reader is: the first unfinished round, except while `hold` pins
  // the one they just answered so its reveal doesn't vanish under them.
  const [hold, setHold] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const firstOpen = rounds.findIndex((r) => !rewarded[r.key])
  const pos = hold ?? (firstOpen < 0 ? rounds.length : firstOpen)
  const allDone = rounds.length > 0 && firstOpen < 0

  useEffect(() => {
    if (!allDone) return
    mark(ARCH_DONE_KEY)
    unlock('recon')
  }, [allDone])

  if (rounds.length === 0) return null

  const round = pos < rounds.length ? rounds[pos] : null
  const onResolve = () => setHold(pos)
  const onNext = () => setHold(null)

  return (
    <div className="rounded-xl border border-glass-accent2/35 bg-gradient-to-b from-glass-accent2/8 to-transparent p-5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-glass-accent2">🛰 Architecture recon</span>
        <div className="ml-auto flex items-center gap-1">
          {rounds.map((r, i) => (
            <span
              key={r.key}
              title={rewarded[r.key] ? 'done' : i === pos ? 'you are here' : 'ahead'}
              className={cn(
                'h-1.5 rounded-full transition-all',
                rewarded[r.key] ? 'w-5 bg-glass-accent2' : i === pos ? 'w-5 bg-glass-warm' : 'w-2 bg-ink-700'
              )}
            />
          ))}
        </div>
      </div>

      {!allDone && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-300">
          Call the shape of this thing <span className="text-glass-warm">before</span> you read it — being wrong here is
          the point. Round {Math.min(pos + 1, rounds.length)} of {rounds.length}.
        </p>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={round?.key ?? 'summary'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="mt-4"
        >
          {round?.kind === 'scale' && <ScaleRound round={round} onResolve={onResolve} onNext={onNext} />}
          {round?.kind === 'order' && <OrderRound round={round} onResolve={onResolve} onNext={onNext} />}
          {round?.kind === 'quiz' && <QuizRound round={round} onResolve={onResolve} onNext={onNext} />}
          {!round && (
            <div>
              <div className="flex items-center gap-2 text-[14px] font-bold text-glass-accent2">
                <span className="text-[20px]">🛰</span> Recon complete — you have a model now.
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                Every section from here either confirms it or breaks it. That's the fun part.
              </p>
              <button
                onClick={() => setSummaryOpen((o) => !o)}
                className="no-drag mt-3 text-[12px] text-ink-600 hover:text-white"
              >
                {summaryOpen ? '▾ hide what you called' : '▸ review what you called'}
              </button>
              {summaryOpen && (
                <div className="mt-3 space-y-2">
                  {rounds.map((r) => (
                    <div key={r.key} className="rounded-lg border border-ink-700 bg-ink-900/60 p-3">
                      <div className="text-[12.5px] font-medium text-gray-200">
                        {r.kind === 'scale'
                          ? `📐 Size of the change — ${r.detail}`
                          : r.kind === 'order'
                            ? r.title
                            : r.q.question}
                      </div>
                      {r.kind === 'order' && (
                        <ol className="mt-1.5 space-y-0.5 text-[12px] text-ink-500">
                          {r.items.map((it, i) => (
                            <li key={it.id}>
                              {i + 1}. {it.primary}
                            </li>
                          ))}
                        </ol>
                      )}
                      {r.kind === 'quiz' && (
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                          <span className="text-glass-add">{r.q.options[r.q.correctIndex]}</span> — {r.q.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Continue({ onNext, label = 'Continue →' }: { onNext: () => void; label?: string }) {
  return (
    <button
      onClick={onNext}
      className="no-drag mt-4 rounded-lg bg-glass-accent2 px-4 py-2 text-[13px] font-semibold text-ink-950 hover:brightness-110"
    >
      {label}
    </button>
  )
}

const REWARD_SCALE = 15

/** Round 1: guess the blast radius before seeing a single path. */
function ScaleRound({
  round,
  onResolve,
  onNext
}: {
  round: Extract<ArchRound, { kind: 'scale' }>
  onResolve: () => void
  onNext: () => void
}) {
  const rewardOnce = useGame((s) => s.rewardOnce)
  const mark = useGame((s) => s.mark)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)
  const [picked, setPicked] = useState<number | null>(null)

  const choose = (i: number, e: React.MouseEvent) => {
    if (picked !== null) return
    setPicked(i)
    if (i === round.correctIndex) {
      rewardOnce(round.key, REWARD_SCALE, {
        x: e.clientX,
        y: e.clientY,
        reason: 'called it 📐',
        sound: 'correct',
        confetti: true
      })
    } else {
      // A wrong size guess still teaches the scale — take the round, not the coins.
      mark(round.key)
      breakCombo()
      if (sfxOn) play('wrong')
    }
    onResolve()
  }

  return (
    <div>
      <p className="text-[14px] font-medium text-gray-100">📐 How much code does this change touch?</p>
      <p className="mt-0.5 text-[11.5px] text-ink-600">one guess · +{REWARD_SCALE}🪙 if you call it</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {round.options.map((opt, i) => {
          const state =
            picked === null ? 'idle' : i === round.correctIndex ? 'correct' : i === picked ? 'wrong' : 'idle'
          return (
            <motion.button
              key={opt}
              disabled={picked !== null}
              onClick={(e) => choose(i, e)}
              whileTap={{ scale: 0.98 }}
              animate={state === 'wrong' ? { x: [0, -8, 8, -4, 4, 0] } : {}}
              className={cn(
                'no-drag rounded-lg border px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                state === 'correct'
                  ? 'border-glass-add bg-glass-add/15 text-white'
                  : state === 'wrong'
                    ? 'border-glass-del bg-glass-del/15 text-white'
                    : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent2/60'
              )}
            >
              {opt}
            </motion.button>
          )
        })}
      </div>
      {picked !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="mt-3 rounded-lg bg-ink-900/70 p-3 text-[13px] leading-relaxed text-gray-200">
            <span className="font-bold">{picked === round.correctIndex ? '🎯 Spot on. ' : '📏 Bigger picture: '}</span>
            it's <span className="font-mono text-glass-accent2">{round.detail}</span>. Keep that number in your head —
            it's how much you're on the hook for.
          </div>
          <Continue onNext={onNext} />
        </motion.div>
      )}
    </div>
  )
}

/** Rounds 2/3: click the items into the right order. Shared by hot spots and flow stages. */
function OrderRound({
  round,
  onResolve,
  onNext
}: {
  round: Extract<ArchRound, { kind: 'order' }>
  onResolve: () => void
  onNext: () => void
}) {
  const rewardOnce = useGame((s) => s.rewardOnce)
  const mark = useGame((s) => s.mark)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)

  // `round.items` is already in the right order — display it shuffled.
  const display = useMemo(() => {
    const idx = round.items.map((_, i) => i)
    const s = shuffle(idx)
    // A shuffle that lands on the answer is no guess at all.
    return s.every((v, i) => v === i) ? [...s.slice(1), s[0]] : s
  }, [round.key])

  const [placed, setPlaced] = useState<number[]>([])
  const [wrong, setWrong] = useState<number | null>(null)
  const [misses, setMisses] = useState(0)
  const [gaveUp, setGaveUp] = useState(false)
  const solved = placed.length === round.items.length

  const click = (i: number, e: React.MouseEvent) => {
    if (solved || placed.includes(i)) return
    if (i === placed.length) {
      const next = [...placed, i]
      setPlaced(next)
      if (sfxOn) play('tick')
      if (next.length === round.items.length) {
        rewardOnce(round.key, round.reward, {
          x: e.clientX,
          y: e.clientY,
          reason: 'sequenced! 🔀',
          sound: 'jackpot',
          confetti: true
        })
        onResolve()
      }
    } else {
      setWrong(i)
      setMisses((m) => m + 1)
      breakCombo()
      if (sfxOn) play('wrong')
      setTimeout(() => setWrong(null), 400)
    }
  }

  const reveal = () => {
    setPlaced(round.items.map((_, i) => i))
    setGaveUp(true)
    mark(round.key)
    if (sfxOn) play('reveal')
    onResolve()
  }

  return (
    <div>
      <p className="text-[14px] font-medium text-gray-100">{round.title}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-600">
        {round.prompt} · +{round.reward}🪙 · {placed.length}/{round.items.length} placed
      </p>
      <div className="mt-3 space-y-2">
        {display.map((i) => {
          const item = round.items[i]
          const spot = placed.indexOf(i)
          const done = spot >= 0
          return (
            <motion.button
              key={item.id}
              disabled={done}
              onClick={(e) => click(i, e)}
              animate={wrong === i ? { x: [0, -8, 8, -4, 4, 0] } : {}}
              className={cn(
                'no-drag flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
                done
                  ? gaveUp
                    ? 'border-ink-600 bg-ink-800/60 text-gray-300'
                    : 'border-glass-add bg-glass-add/15 text-white'
                  : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent2/60'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold',
                  done ? (gaveUp ? 'bg-ink-600 text-ink-900' : 'bg-glass-add text-ink-950') : 'bg-ink-700 text-ink-500'
                )}
              >
                {done ? spot + 1 : '?'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]">{item.primary}</span>
                {item.secondary && (
                  <span className="block truncate font-mono text-[10.5px] text-ink-600">{item.secondary}/</span>
                )}
              </span>
            </motion.button>
          )
        })}
      </div>

      {solved ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="mt-3 text-[13px] text-gray-200">
            {gaveUp ? '👀 That’s the real order — worth a second look.' : '🎯 Nailed the order.'}
          </p>
          <Continue onNext={onNext} />
        </motion.div>
      ) : (
        misses >= 3 && (
          <button onClick={reveal} className="no-drag mt-3 text-[12px] text-ink-600 hover:text-white">
            stuck? show me the order (no coins)
          </button>
        )
      )}
    </div>
  )
}

const REWARD_ARCH_FIRST = 30
const REWARD_ARCH_RETRY = 8

/** The AI's high-level questions: the shape, the data, the boundaries. */
function QuizRound({
  round,
  onResolve,
  onNext
}: {
  round: Extract<ArchRound, { kind: 'quiz' }>
  onResolve: () => void
  onNext: () => void
}) {
  const { q } = round
  const award = useGame((s) => s.award)
  const mark = useGame((s) => s.mark)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)

  const [picked, setPicked] = useState<number | null>(null)
  const [attempts, setAttempts] = useState(0)
  const solved = picked === q.correctIndex
  const facet = FACET_META[q.facet] ?? FACET_META.shape

  const choose = (i: number, e: React.MouseEvent) => {
    if (solved) return
    setPicked(i)
    if (i === q.correctIndex) {
      const first = attempts === 0
      award(first ? REWARD_ARCH_FIRST : REWARD_ARCH_RETRY, {
        x: e.clientX,
        y: e.clientY,
        reason: first ? 'architect 🏗' : 'got there',
        sound: 'correct',
        confetti: first
      })
      mark(round.key)
      onResolve()
    } else {
      setAttempts((a) => a + 1)
      breakCombo()
      if (sfxOn) play('wrong')
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-glass-accent2/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-glass-accent2">
          {facet.emoji} {facet.label}
        </span>
        <span className="text-[11px] text-ink-600">+{REWARD_ARCH_FIRST}🪙 first try</span>
      </div>
      <p className="text-[14px] font-medium text-gray-100">{q.question}</p>

      <div className="mt-3 space-y-2">
        {q.options.map((opt, i) => {
          const isPicked = picked === i
          const isCorrect = i === q.correctIndex
          const state = picked !== null && isCorrect ? 'correct' : isPicked && !isCorrect ? 'wrong' : 'idle'
          return (
            <motion.button
              key={i}
              disabled={solved}
              onClick={(e) => choose(i, e)}
              whileTap={{ scale: 0.98 }}
              animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : {}}
              transition={{ duration: 0.35 }}
              className={cn(
                'no-drag flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13.5px] transition-colors',
                state === 'correct'
                  ? 'border-glass-add bg-glass-add/15 text-white'
                  : state === 'wrong'
                    ? 'border-glass-del bg-glass-del/15 text-white'
                    : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent2/60'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold',
                  state === 'correct'
                    ? 'bg-glass-add text-ink-950'
                    : state === 'wrong'
                      ? 'bg-glass-del text-white'
                      : 'bg-ink-700 text-gray-300'
                )}
              >
                {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : String.fromCharCode(65 + i)}
              </span>
              {opt}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {picked !== null && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div
              className={cn(
                'mt-3 rounded-lg p-3 text-[13px] leading-relaxed text-gray-200',
                solved ? 'bg-glass-add/10' : 'bg-glass-warm/10'
              )}
            >
              <span className="font-bold">{solved ? '🏗 That’s the shape. ' : '🤔 Not the model. '}</span>
              {q.explanation}
              {!solved && <div className="mt-1 text-[12px] text-glass-warm">Try again — pick another answer.</div>}
            </div>
            {solved && <Continue onNext={onNext} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
