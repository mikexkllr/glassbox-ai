import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SectionPlan } from '@shared/types'
import { useStore } from '../store'
import { useGame, DAILY_GOAL_XP } from '../game/store'
import { cn } from '../lib/files'
import { WARMUP_ID, buildWarmupLesson, doneKey, outstandingMistakes, perfectKey, practiceCount } from '../lib/lessons'
import AgentStatus from './AgentStatus'
import OverviewCard from './OverviewCard'
import type { LessonRef } from './lesson/LessonPlayer'
import { Btn } from './lesson/ui'

type NodeStatus = 'done' | 'current' | 'locked'

interface PathNode {
  id: string
  kind: 'warmup' | 'section' | 'finale'
  title: string
  sub: string
  plan?: SectionPlan
  index?: number
  status: NodeStatus
  perfect?: boolean
}

/** Horizontal offsets that make the path wind, like a trail down a hill. */
const WIND = [0, 64, 96, 64, 0, -64, -96, -64]

/**
 * The walkthrough as a learning path: a warm-up, one lesson per section, and the
 * verdict at the end. Lessons unlock in order (you can jump ahead), and the
 * next one is prepared in the background so START is usually instant.
 */
export default function LearnPath({
  onStart,
  onCashout,
  onHunt,
  onBoss,
  onArcade,
  onMap,
  onFlow
}: {
  onStart: (lesson: LessonRef) => void
  onCashout: () => void
  onHunt: () => void
  onBoss: () => void
  onArcade: () => void
  onMap: () => void
  onFlow: () => void
}) {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const diff = useStore((s) => s.diff)
  const live = useStore((s) => s.live)
  const ensureSection = useStore((s) => s.ensureSection)
  const ensureOverview = useStore((s) => s.ensureOverview)
  const rewarded = useGame((s) => s.rewarded)

  const [open, setOpen] = useState<string | null>(null)
  const [bigPicture, setBigPicture] = useState(false)
  const topicMode = diff?.mode === 'topic'

  const hasWarmup = useMemo(() => !!overview && buildWarmupLesson(overview, diff).length > 0, [overview, diff])

  const nodes = useMemo<PathNode[]>(() => {
    if (!overview) return []
    const out: PathNode[] = []
    if (hasWarmup)
      out.push({ id: WARMUP_ID, kind: 'warmup', title: 'Warm-up', sub: 'Guess the shape before you read', status: 'locked' })
    overview.sections.forEach((plan, index) =>
      out.push({ id: plan.id, kind: 'section', title: plan.title, sub: plan.teaser, plan, index, status: 'locked' })
    )
    let current = false
    for (const n of out) {
      if (rewarded[doneKey(n.id)]) {
        n.status = 'done'
        n.perfect = !!rewarded[perfectKey(n.id)]
      } else if (!current) {
        n.status = 'current'
        current = true
      }
    }
    out.push({
      id: 'finale',
      kind: 'finale',
      title: topicMode ? 'Journey complete' : 'Your verdict',
      sub: topicMode ? 'You answered your question' : 'Approve or request changes — earned, not clicked',
      status: current ? 'locked' : 'current'
    })
    return out
  }, [overview, rewarded, hasWarmup, topicMode])

  const lessons = nodes.filter((n) => n.kind !== 'finale')
  const doneCount = lessons.filter((n) => n.status === 'done').length

  // Prepare the next lesson's section in the background, so START is instant.
  const nextPlan = nodes.find((n) => n.kind === 'section' && n.status !== 'done')?.plan
  useEffect(() => {
    if (!nextPlan || sections[nextPlan.id]) return
    const l = live[nextPlan.id]
    if (l?.busy || l?.error) return
    void ensureSection(nextPlan)
  }, [nextPlan?.id, !!(nextPlan && sections[nextPlan.id])])

  // Land on the current node.
  const currentRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [overview?.title])

  // Close the node card on any outside click / Esc.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-path-node]')) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  if (!overview) {
    const ov = live['overview']
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center px-8 pt-16">
        <div className="w-full max-w-md">
          {ov?.error ? (
            <div className="rounded-2xl border border-glass-del/30 bg-glass-del/10 p-4">
              <p className="text-[14px] font-bold text-glass-del">Couldn't build the walkthrough</p>
              <p className="mt-1 line-clamp-3 text-[12.5px] text-gray-400">{ov.error}</p>
              <div className="mt-4">
                <Btn onClick={() => void ensureOverview()}>Try again</Btn>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-[22px] font-extrabold text-white">Building your course…</h2>
              <p className="mb-5 text-[14px] text-gray-400">
                The agent is reading the whole change to plan your lessons.
              </p>
              <AgentStatus scope="overview" />
            </>
          )}
        </div>
      </div>
    )
  }

  const start = (n: PathNode) => {
    setOpen(null)
    if (n.kind === 'warmup') onStart({ kind: 'warmup' })
    else if (n.kind === 'section') onStart({ kind: 'section', planId: n.id })
    else if (topicMode) setBigPicture(true)
    else onCashout()
  }

  return (
    <div className="flex min-h-0 flex-1">
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-6 pb-24 pt-6">
          {/* unit banner */}
          <div className="rounded-2xl bg-gradient-to-br from-glass-accent2 to-[#3fa8c9] p-5 text-ink-950 shadow-[0_5px_0_0_#2c8f78]">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] opacity-70">
                  {topicMode ? '🧭 Your question' : `${diff?.base} → ${diff?.feature}`}
                </div>
                <h1 className="mt-1 text-[22px] font-black leading-tight">{overview.title}</h1>
                <p className="mt-1.5 text-[14px] font-medium leading-snug opacity-80">{overview.whatGist}</p>
              </div>
              <button
                onClick={() => setBigPicture(true)}
                className="no-drag flex-none rounded-xl border-2 border-ink-950/20 bg-white/15 px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide hover:bg-white/25"
              >
                📖 Big picture
              </button>
            </div>
          </div>

          {/* the path */}
          <div className="relative mt-16 flex flex-col items-center gap-9">
            {nodes.map((n, i) => {
              const x = WIND[i % WIND.length]
              const sec = n.plan ? sections[n.plan.id] : undefined
              const l = n.plan ? live[n.plan.id] : undefined
              return (
                <div
                  key={n.id}
                  ref={n.status === 'current' && n.kind !== 'finale' ? currentRef : undefined}
                  // The open card must stack above the nodes further down the trail.
                  className={cn('relative flex w-full justify-center', open === n.id && 'z-30')}
                >
                  <div className="relative" style={{ transform: `translateX(${x}px)` }} data-path-node>
                    <NodeButton node={n} busy={!!l?.busy} onClick={() => setOpen(open === n.id ? null : n.id)} />
                    {/* label on the open side of the trail */}
                    <div
                      className={cn(
                        'pointer-events-none absolute top-1/2 w-[190px] -translate-y-1/2',
                        x > 0 ? 'right-[96px] text-right' : 'left-[96px]'
                      )}
                    >
                      <div
                        className={cn(
                          'truncate text-[14px] font-bold',
                          n.status === 'locked' ? 'text-ink-600' : 'text-gray-100'
                        )}
                      >
                        {n.kind === 'section' ? `${(n.index ?? 0) + 1}. ${n.title}` : n.title}
                      </div>
                      <div className="truncate text-[12px] text-ink-600">
                        {l?.busy ? 'preparing…' : l?.error ? '⚠ needs a retry' : n.sub}
                      </div>
                    </div>

                    <AnimatePresence>
                      {open === n.id && (
                        <NodeCard
                          node={n}
                          blocks={sec?.chunks.length}
                          files={n.plan?.files.length}
                          preparing={!!l?.busy}
                          failed={!!l?.error && !l.busy}
                          lessonsLeft={lessons.length - doneCount}
                          topicMode={topicMode}
                          onStart={() => start(n)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      <Rail
        doneCount={doneCount}
        total={lessons.length}
        topicMode={topicMode}
        onPractice={() => onStart({ kind: 'practice' })}
        onCashout={onCashout}
        onHunt={onHunt}
        onBoss={onBoss}
        onArcade={onArcade}
        onMap={onMap}
        onFlow={onFlow}
      />

      {bigPicture && (
        <div data-overlay className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={() => setBigPicture(false)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-h-full w-[640px] max-w-full overflow-y-auto rounded-2xl bg-ink-950"
            onClick={(e) => e.stopPropagation()}
          >
            <OverviewCard />
            <div className="flex justify-end p-4">
              <Btn tone="ghost" onClick={() => setBigPicture(false)}>
                Close
              </Btn>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

const NODE_TONE: Record<NodeStatus, string> = {
  done: 'bg-glass-warm text-ink-950 shadow-[0_7px_0_0_#b8793a]',
  current: 'bg-glass-accent2 text-ink-950 shadow-[0_7px_0_0_#2c8f78]',
  locked: 'bg-ink-800 text-ink-600 shadow-[0_7px_0_0_#141821]'
}

function NodeButton({ node, busy, onClick }: { node: PathNode; busy: boolean; onClick: () => void }) {
  const icon =
    node.status === 'locked'
      ? node.kind === 'finale'
        ? '🏆'
        : '🔒'
      : node.kind === 'finale'
        ? '🏆'
        : node.status === 'done'
          ? node.perfect
            ? '👑'
            : '✓'
          : node.kind === 'warmup'
            ? '🛰'
            : '★'
  return (
    <div className="relative">
      {node.status === 'current' && (
        <>
          <motion.div
            className="pointer-events-none absolute -inset-2 rounded-full border-4 border-glass-accent2/40"
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 0.2, 0.7] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          <motion.div
            className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-ink-700 bg-ink-900 px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-wide text-glass-accent2"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            {node.kind === 'finale' ? 'Claim' : 'Start'}
          </motion.div>
        </>
      )}
      <button
        onClick={onClick}
        className={cn(
          'no-drag relative flex h-[76px] w-[76px] items-center justify-center rounded-full text-[28px] font-black transition-transform active:translate-y-[5px] active:shadow-none',
          NODE_TONE[node.status],
          node.kind === 'finale' && node.status === 'locked' && 'grayscale'
        )}
      >
        {icon}
        {busy && (
          <span className="absolute -right-1 -top-1 h-5 w-5 animate-spin rounded-full border-[3px] border-glass-accent2/30 border-t-glass-accent2 bg-ink-950" />
        )}
      </button>
    </div>
  )
}

function NodeCard({
  node,
  blocks,
  files,
  preparing,
  failed,
  lessonsLeft,
  topicMode,
  onStart
}: {
  node: PathNode
  blocks?: number
  files?: number
  preparing: boolean
  failed: boolean
  lessonsLeft: number
  topicMode: boolean
  onStart: () => void
}) {
  const locked = node.status === 'locked'
  const finale = node.kind === 'finale'
  const meta =
    node.kind === 'warmup'
      ? 'A few guesses, then the big picture'
      : node.kind === 'section'
        ? [
            files ? `${files} file${files === 1 ? '' : 's'}` : '',
            blocks ? `${blocks} code block${blocks === 1 ? '' : 's'}` : '',
            preparing ? 'preparing…' : failed ? 'failed to prepare — start to retry' : ''
          ]
            .filter(Boolean)
            .join(' · ')
        : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.14 }}
      className={cn(
        'absolute left-1/2 top-[92px] z-20 w-[310px] -translate-x-1/2 rounded-2xl border-2 p-4 text-left shadow-2xl',
        locked ? 'border-ink-700 bg-ink-850' : node.status === 'done' ? 'border-glass-warm/60 bg-ink-900' : 'border-glass-accent2/60 bg-ink-900'
      )}
    >
      <div className="text-[16px] font-extrabold leading-snug text-white">{node.title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-400">{node.sub}</p>
      {meta && <p className="mt-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-600">{meta}</p>}
      <div className="mt-4">
        {finale ? (
          locked ? (
            <p className="text-[13px] text-gray-400">
              Finish {lessonsLeft} more lesson{lessonsLeft === 1 ? '' : 's'} to {topicMode ? 'complete the journey' : 'unlock your verdict'}.
            </p>
          ) : (
            <Btn tone="warm" onClick={onStart} className="w-full">
              {topicMode ? 'See the big picture' : 'Mint your verdict'}
            </Btn>
          )
        ) : locked ? (
          <>
            <p className="mb-3 text-[12.5px] text-gray-400">Finish the lessons before this one to unlock it — or jump ahead.</p>
            <Btn tone="ghost" onClick={onStart} className="w-full">
              Jump ahead
            </Btn>
          </>
        ) : (
          <Btn tone={node.status === 'done' ? 'warm' : 'primary'} onClick={onStart} className="w-full">
            {node.status === 'done' ? 'Practice again' : 'Start'}
          </Btn>
        )}
      </div>
    </motion.div>
  )
}

function Rail({
  doneCount,
  total,
  topicMode,
  onPractice,
  onCashout,
  onHunt,
  onBoss,
  onArcade,
  onMap,
  onFlow
}: {
  doneCount: number
  total: number
  topicMode: boolean
  onPractice: () => void
  onCashout: () => void
  onHunt: () => void
  onBoss: () => void
  onArcade: () => void
  onMap: () => void
  onFlow: () => void
}) {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const diff = useStore((s) => s.diff)
  const rewarded = useGame((s) => s.rewarded)
  const streak = useGame((s) => s.streak)
  const safe = useGame((s) => s.streakSafeToday())
  const xpToday = useGame((s) => s.xpToday())

  const mistakes = useMemo(
    () => (overview ? practiceCount(outstandingMistakes(rewarded), overview, sections, diff) : 0),
    [rewarded, overview, sections, diff]
  )
  const goalPct = Math.min(100, Math.round((xpToday / DAILY_GOAL_XP) * 100))
  const allDone = total > 0 && doneCount === total

  return (
    <aside className="hidden w-[300px] flex-none space-y-4 overflow-y-auto border-l border-ink-800 p-5 lg:block">
      <Card>
        <div className="flex items-center gap-3">
          <span className={cn('text-[34px] leading-none', !safe && 'grayscale')}>🔥</span>
          <div>
            <div className={cn('text-[22px] font-black leading-none', safe ? 'text-glass-warm' : 'text-gray-300')}>
              {streak} day{streak === 1 ? '' : 's'}
            </div>
            <div className="mt-1 text-[12px] text-gray-400">
              {safe ? 'Streak safe today' : streak > 0 ? 'Finish a lesson to keep it' : 'Finish a lesson to start a streak'}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[12px] font-bold">
            <span className="text-gray-300">⚡ Daily goal</span>
            <span className="text-ink-600">
              {xpToday}/{DAILY_GOAL_XP} XP
            </span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-glass-warm transition-all" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-[15px] font-extrabold text-white">🎯 Practice</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-400">
          {mistakes > 0
            ? `${mistakes} question${mistakes === 1 ? '' : 's'} you missed. Get them right to make them stick.`
            : 'Questions you miss land here for a second try.'}
        </p>
        <Btn tone="ghost" disabled={mistakes === 0} onClick={onPractice} className="mt-3 w-full">
          Practice mistakes
        </Btn>
      </Card>

      {!topicMode && (
        <Card>
          <div className="text-[15px] font-extrabold text-white">🏁 Your verdict</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-gray-400">
            {allDone
              ? 'You understand the change. Spend your coins to mint an Approve / Request-changes review.'
              : `Finish every lesson to unlock it — ${doneCount}/${total} done.`}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-glass-accent2 transition-all"
              style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
            />
          </div>
          <Btn tone="warm" disabled={!allDone} onClick={onCashout} className="mt-3 w-full">
            Mint verdict
          </Btn>
        </Card>
      )}

      <Card>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-600">More ways to learn</div>
        <div className="-mx-2">
          <RailLink icon="🐛" label="Bug Hunt" sub="Spot what a reviewer would flag" onClick={onHunt} />
          <RailLink icon="⚔️" label="Boss Fight" sub="Rapid recall across every lesson" onClick={onBoss} />
          {!topicMode && <RailLink icon="🗺️" label="Blast radius" sub="Map of everything that changed" onClick={onMap} />}
          <RailLink icon="🌊" label="Data flow" sub="Watch values move through it" onClick={onFlow} />
          <RailLink icon="🕹️" label="Arcade" sub="Mini-games, shop and quests" onClick={onArcade} />
        </div>
      </Card>
    </aside>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border-2 border-ink-800 bg-ink-900/60 p-4">{children}</div>
}

function RailLink({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="no-drag flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-850">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-ink-850 text-[18px]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold text-gray-100">{label}</span>
        <span className="block truncate text-[11.5px] text-ink-600">{sub}</span>
      </span>
    </button>
  )
}
