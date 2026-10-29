import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ScoreResult } from '@shared/types'
import { useStore } from '../../store'
import { useGame } from '../../game/store'
import { play } from '../../game/sfx'
import { cn } from '../../lib/files'
import {
  WARMUP_ID,
  buildPracticeLesson,
  buildSectionLesson,
  buildWarmupLesson,
  doneKey,
  grade,
  isGraded,
  lessonPayout,
  missKey,
  outstandingMistakes,
  perfectKey,
  reshuffle,
  type Exercise,
  type Response
} from '../../lib/lessons'
import AgentStatus from '../AgentStatus'
import CodingChallenge from '../CodingChallenge'
import { BlankEx, ChoiceEx, ExplainEx, LearnCard, LearnChunkCard, MatchEx, OrderEx, TapLineEx } from './Exercises'
import { Btn } from './ui'

export type LessonRef = { kind: 'warmup' } | { kind: 'section'; planId: string } | { kind: 'practice' }

interface QItem {
  ex: Exercise
  key: string
  /** A re-queued attempt at something missed earlier in this lesson. */
  retry: boolean
}

interface Feedback {
  tone: 'right' | 'wrong' | 'neutral'
  title: string
  answer?: string
  explanation?: string
  score?: ScoreResult
}

interface Results {
  xp: number
  coins: number
  accuracy: number
  ms: number
  perfect: boolean
  streak: number
  extended: boolean
  goalReached: boolean
}

const PRAISE = ['Nice!', 'Correct!', 'You got it!', 'Spot on!', 'Exactly.', 'Great read!']
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)]

function explanationOf(ex: Exercise): string | undefined {
  return ex.kind === 'choice' ? ex.explanation : undefined
}

/**
 * The Duolingo loop, full-screen: one screen at a time, Check → a green or red
 * sheet that explains → Continue. Anything missed comes back at the end of the
 * lesson until it's answered right, and the lesson closes on a results screen.
 */
export default function LessonPlayer({
  lesson,
  onExit,
  onHunt
}: {
  lesson: LessonRef
  onExit: () => void
  onHunt: (sectionId: string) => void
}) {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const diff = useStore((s) => s.diff)
  const ensureSection = useStore((s) => s.ensureSection)
  const retrySection = useStore((s) => s.retrySection)
  const markWalked = useStore((s) => s.markWalked)
  const prefetchNext = useStore((s) => s.settings?.prefetchNext)

  const mark = useGame((s) => s.mark)
  const unlock = useGame((s) => s.unlock)
  const completeLesson = useGame((s) => s.completeLesson)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const plans = overview?.sections ?? []
  const planIdx = lesson.kind === 'section' ? plans.findIndex((p) => p.id === lesson.planId) : -1
  const plan = planIdx >= 0 ? plans[planIdx] : null
  const section = plan ? sections[plan.id] : undefined
  const lessonId = lesson.kind === 'section' ? lesson.planId : lesson.kind === 'warmup' ? WARMUP_ID : 'practice'
  const live = useStore((s) => (plan ? s.live[plan.id] : undefined))

  const [queue, setQueue] = useState<QItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [pos, setPos] = useState(0)
  const [response, setResponse] = useState<Response>(null)
  const [fb, setFb] = useState<Feedback | null>(null)
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [inRow, setInRow] = useState(0)
  const [scoring, setScoring] = useState(false)
  const [results, setResults] = useState<Results | null>(null)
  const [quitOpen, setQuitOpen] = useState(false)
  const stats = useRef({ answers: 0, right: 0, firstTry: 0, retried: 0 })
  const startedAt = useRef(Date.now())
  // Replaying a finished lesson still teaches, but shouldn't farm a full payout.
  const replay = useRef(!!useGame.getState().rewarded[doneKey(lessonId)])

  // A section lesson needs its section generated first.
  useEffect(() => {
    if (lesson.kind === 'section' && plan && !section) void ensureSection(plan)
  }, [plan?.id, !!section])
  useEffect(() => {
    if (lesson.kind !== 'section' || !section || !prefetchNext) return
    const next = plans[planIdx + 1]
    if (next) void ensureSection(next)
  }, [!!section])

  // Build the queue once its content exists — a lesson never reshuffles under you.
  useEffect(() => {
    if (queue || !overview) return
    let items: Exercise[] | null = null
    if (lesson.kind === 'warmup') items = buildWarmupLesson(overview, diff)
    else if (lesson.kind === 'practice')
      items = buildPracticeLesson(outstandingMistakes(useGame.getState().rewarded), overview, sections, diff)
    else if (plan && section) {
      const loaded = plans.map((p) => sections[p.id]).filter(Boolean)
      items = buildSectionLesson(plan, section, loaded, planIdx)
    }
    if (!items) return
    setQueue(items.map((ex) => ({ ex, key: `${ex.id}#0`, retry: false })))
    setTotal(items.length)
    startedAt.current = Date.now()
  }, [overview, section, queue])

  const item = queue && pos < queue.length ? queue[pos] : null
  const ex = item?.ex ?? null
  const locked = fb !== null

  const complete = (e: Exercise) => {
    setDoneIds((d) => (d.includes(e.id) ? d : [...d, e.id]))
    e.marks?.forEach((k) => mark(k))
  }

  const resolveGraded = (correct: boolean, answer?: string) => {
    if (!item || !ex) return
    stats.current.answers++
    setVerdict(correct)
    if (correct) {
      stats.current.right++
      if (item.retry) stats.current.retried++
      else stats.current.firstTry++
      setInRow((n) => n + 1)
      complete(ex)
      if (sfxOn) play('correct')
      setFb({ tone: 'right', title: praise(), explanation: explanationOf(ex) })
      return
    }
    setInRow(0)
    if (sfxOn) play('wrong')
    if (ex.guess) {
      // Warm-up guesses are allowed to be wrong — they're done, and the answer is the lesson.
      complete(ex)
      setFb({ tone: 'neutral', title: 'Now you know', answer, explanation: explanationOf(ex) })
      return
    }
    mark(missKey(ex.id))
    setQueue((q) => (q ? [...q, { ex: reshuffle(ex), key: `${ex.id}#${q.length}`, retry: true }] : q))
    setFb({ tone: 'wrong', title: 'Not quite', answer, explanation: explanationOf(ex) })
  }

  const check = async () => {
    if (!ex || locked) return
    if (ex.kind === 'explain') {
      const text = typeof response === 'string' ? response.trim() : ''
      if (!text || !diff || scoring) return
      setScoring(true)
      let score: ScoreResult | undefined
      try {
        score = await window.glassbox.scoreAnswer(diff, ex.prompt, ex.answer, text)
      } catch {
        score = undefined
      }
      setScoring(false)
      complete(ex)
      const good = !!score && score.score >= 60
      if (sfxOn) play(good ? 'correct' : 'reveal')
      setVerdict(good)
      setFb({
        tone: good ? 'right' : 'neutral',
        title: score ? `${score.score}/100 · ${score.verdict}` : "Couldn't grade that — here's a strong answer",
        score,
        explanation: ex.answer
      })
      return
    }
    if (!isGraded(ex)) return next()
    const g = grade(ex, response)
    resolveGraded(g.correct, g.answer)
  }

  /** "Can't tell — show me": an honest miss. Counts as wrong and comes back later. */
  const showMe = () => {
    if (!ex || locked) return
    if (ex.kind === 'explain') {
      setVerdict(null)
      setDoneIds((d) => (d.includes(ex.id) ? d : [...d, ex.id]))
      setFb({ tone: 'neutral', title: "Here's a strong answer", explanation: ex.answer })
      return
    }
    setResponse(null)
    resolveGraded(false, grade(ex, null).answer)
  }

  const next = () => {
    if (!queue || !ex) return
    if (!locked && !isGraded(ex) && ex.kind !== 'explain') complete(ex)
    setFb(null)
    setVerdict(null)
    setResponse(null)
    if (pos + 1 >= queue.length) finish()
    else setPos(pos + 1)
  }

  const finish = () => {
    const s = stats.current
    const accuracy = s.answers ? Math.round((100 * s.right) / s.answers) : 100
    const perfect = s.right === s.answers
    const practice = lesson.kind === 'practice' || replay.current
    const pay = lessonPayout({ firstTry: s.firstTry, retried: s.retried, perfect, practice })
    const r = completeLesson(pay)
    if (lesson.kind !== 'practice') {
      mark(doneKey(lessonId))
      if (perfect && s.answers > 0) mark(perfectKey(lessonId))
    }
    if (lesson.kind === 'section' && plan) {
      markWalked(plan.id)
      unlock('first_section')
    }
    if (lesson.kind === 'warmup') unlock('recon')
    if (sfxOn) play('levelup')
    pushFx({ kind: 'confetti' })
    setResults({ ...pay, accuracy, ms: Date.now() - startedAt.current, perfect, ...r })
  }

  const requestQuit = () => {
    if (results || doneIds.length === 0) onExit()
    else setQuitOpen(true)
  }

  const ready =
    !!ex &&
    !locked &&
    (ex.kind === 'choice' || ex.kind === 'tapline'
      ? typeof response === 'number'
      : ex.kind === 'order'
        ? Array.isArray(response) && response.length === ex.items.length
        : ex.kind === 'blank'
          ? typeof response === 'string'
          : ex.kind === 'explain'
            ? typeof response === 'string' && response.trim().length > 0 && !scoring
            : false)

  // One listener; the handler is refreshed every render so it never sees stale state.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  onKey.current = (e) => {
    if (quitOpen) {
      if (e.key === 'Escape') setQuitOpen(false)
      return
    }
    if (results) {
      if (e.key === 'Enter') onExit()
      return
    }
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'TEXTAREA') {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (locked) next()
        else void check()
      }
      return
    }
    if (tag === 'INPUT') return
    if (e.key === 'Escape') return requestQuit()
    if (!ex) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (locked || ex.kind === 'learn' || ex.kind === 'learn-chunk') next()
      else if (ready) void check()
      return
    }
    const n = Number(e.key)
    if (!locked && Number.isInteger(n) && n >= 1) {
      if (ex.kind === 'choice' && n <= ex.options.length) setResponse(n - 1)
      else if (ex.kind === 'blank' && n <= ex.options.length) setResponse(ex.options[n - 1])
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const isMac = window.glassbox.platform === 'darwin'
  const pct = total ? Math.min(100, (doneIds.length / total) * 100) : 0
  const retriesLeft = queue ? queue.slice(pos + 1).filter((q) => q.retry).length : 0

  return (
    <div data-overlay className="fixed inset-0 z-[140] flex flex-col bg-ink-950">
      {/* top bar: quit, progress, streak-in-lesson */}
      <div
        className="drag flex h-12 flex-none items-center gap-4 px-4"
        style={{ paddingRight: 'calc(16px + 100% - env(titlebar-area-width, 100%))' }}
      >
        {isMac && <div className="w-16" />}
        <button
          onClick={requestQuit}
          title="Quit lesson (Esc)"
          className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-[18px] text-gray-500 hover:bg-ink-850 hover:text-white"
        >
          ✕
        </button>
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3">
          <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-ink-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-glass-accent2 to-[#3fb950]"
              animate={{ width: `${results ? 100 : pct}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 22 }}
            />
            <div className="pointer-events-none absolute left-2 right-2 top-[3px] h-[3px] rounded-full bg-white/15" />
          </div>
        </div>
        <div className="w-28 text-right">
          <AnimatePresence>
            {inRow >= 3 && !results && (
              <motion.span
                key={inRow}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="no-drag text-[12px] font-extrabold uppercase tracking-wide text-glass-warm"
              >
                🔥 {inRow} in a row
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {results ? (
        <ResultsScreen
          results={results}
          practice={lesson.kind === 'practice'}
          sectionId={lesson.kind === 'section' ? lesson.planId : null}
          onContinue={onExit}
          onHunt={onHunt}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] px-6 pb-10 pt-8">
              {!queue ? (
                <Preparing
                  title={plan?.title ?? 'Practice'}
                  teaser={plan?.teaser}
                  index={planIdx}
                  scope={plan?.id}
                  error={live && !live.busy ? live.error : undefined}
                  onRetry={plan ? () => void retrySection(plan) : undefined}
                  onBack={onExit}
                />
              ) : queue.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-[56px]">👌</div>
                  <h1 className="mt-3 text-[24px] font-extrabold text-white">Nothing to practice</h1>
                  <p className="mt-2 text-[15px] text-gray-400">No open mistakes in this walkthrough.</p>
                  <div className="mt-6">
                    <Btn onClick={onExit}>Back to the path</Btn>
                  </div>
                </div>
              ) : (
                ex && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={item!.key}
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      transition={{ duration: 0.22 }}
                    >
                      {item!.retry && (
                        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-glass-warm/10 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-glass-warm">
                          ↺ Previous mistake
                        </div>
                      )}
                      <ExerciseView
                        ex={ex}
                        response={response}
                        setResponse={setResponse}
                        locked={locked}
                        correct={verdict}
                        onMatchDone={(mistakes) => {
                          setResponse({ mistakes })
                          resolveGraded(mistakes === 0)
                        }}
                      />
                    </motion.div>
                  </AnimatePresence>
                )
              )}
            </div>
          </div>

          {queue && queue.length > 0 && ex && (
            <Footer
              ex={ex}
              fb={fb}
              ready={ready}
              scoring={scoring}
              retriesLeft={retriesLeft}
              onCheck={() => void check()}
              onNext={next}
              onShowMe={showMe}
            />
          )}
        </>
      )}

      {quitOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={() => setQuitOpen(false)}>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-[400px] max-w-full rounded-3xl border border-ink-700 bg-ink-900 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[44px]">🥺</div>
            <h2 className="mt-2 text-[20px] font-extrabold text-white">Wait, don't go!</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-400">
              You'll lose your progress in this lesson if you quit now.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Btn onClick={() => setQuitOpen(false)}>Keep learning</Btn>
              <button onClick={onExit} className="no-drag py-1 text-[13px] font-bold uppercase tracking-wide text-glass-del hover:brightness-125">
                End lesson
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function ExerciseView({
  ex,
  response,
  setResponse,
  locked,
  correct,
  onMatchDone
}: {
  ex: Exercise
  response: Response
  setResponse: (r: Response) => void
  locked: boolean
  correct: boolean | null
  onMatchDone: (mistakes: number) => void
}) {
  const props = { response, setResponse, locked, correct }
  switch (ex.kind) {
    case 'learn':
      return <LearnCard ex={ex} />
    case 'learn-chunk':
      return <LearnChunkCard chunk={ex.chunk} explanations={ex.explanations} />
    case 'choice':
      return <ChoiceEx ex={ex} {...props} />
    case 'tapline':
      return <TapLineEx ex={ex} {...props} />
    case 'order':
      return <OrderEx ex={ex} {...props} />
    case 'match':
      return <MatchEx ex={ex} locked={locked} onDone={onMatchDone} />
    case 'blank':
      return <BlankEx ex={ex} {...props} />
    case 'explain':
      return <ExplainEx ex={ex} {...props} />
  }
}

const TONE = {
  right: { bar: 'border-[#3fb950]/40 bg-[#3fb950]/10', text: 'text-[#56d364]', icon: '✓', btn: 'success' as const },
  wrong: { bar: 'border-glass-del/40 bg-glass-del/10', text: 'text-[#ff7b72]', icon: '✕', btn: 'danger' as const },
  neutral: { bar: 'border-glass-warm/40 bg-glass-warm/10', text: 'text-glass-warm', icon: '💡', btn: 'warm' as const }
}

function Footer({
  ex,
  fb,
  ready,
  scoring,
  retriesLeft,
  onCheck,
  onNext,
  onShowMe
}: {
  ex: Exercise
  fb: Feedback | null
  ready: boolean
  scoring: boolean
  retriesLeft: number
  onCheck: () => void
  onNext: () => void
  onShowMe: () => void
}) {
  const teaching = ex.kind === 'learn' || ex.kind === 'learn-chunk'
  const tone = fb ? TONE[fb.tone] : null

  return (
    <footer className={cn('flex-none border-t-2 transition-colors', tone ? tone.bar : 'border-ink-800 bg-ink-950')}>
      <div className="mx-auto flex min-h-[104px] max-w-[960px] items-center gap-6 px-8 py-5">
        {fb && tone ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 flex-1 items-start gap-4"
          >
            <span
              className={cn(
                'flex h-12 w-12 flex-none items-center justify-center rounded-full bg-ink-950/60 text-[22px] font-black',
                tone.text
              )}
            >
              {tone.icon}
            </span>
            <div className="max-h-[34vh] min-w-0 flex-1 overflow-y-auto pr-2">
              <div className={cn('text-[20px] font-extrabold', tone.text)}>{fb.title}</div>
              {fb.answer && (
                <div className="mt-1 text-[14.5px] leading-relaxed text-gray-100">
                  <span className={cn('font-bold', tone.text)}>Correct answer: </span>
                  <span className="whitespace-pre-line">{fb.answer}</span>
                </div>
              )}
              {fb.score && (
                <div className="mt-1 space-y-0.5 text-[13.5px] leading-relaxed">
                  {fb.score.good && <p className="text-[#56d364]">✓ {fb.score.good}</p>}
                  {fb.score.missing && <p className="text-glass-warm">→ {fb.score.missing}</p>}
                </div>
              )}
              {fb.explanation && (
                <p className="mt-1 text-[14px] leading-relaxed text-gray-300">
                  {fb.score && <span className="font-bold text-gray-200">A strong answer: </span>}
                  {fb.explanation}
                </p>
              )}
              {fb.tone === 'wrong' && (
                <p className="mt-1.5 text-[12px] text-ink-600">This one will come back before the lesson ends.</p>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="flex-1">
            {!teaching && ex.kind !== 'match' && (
              <Btn tone="ghost" onClick={onShowMe} disabled={scoring}>
                {ex.kind === 'explain' ? 'Skip' : "Can't tell"}
              </Btn>
            )}
            {ex.kind === 'match' && <span className="text-[13px] text-ink-600">Find every pair to continue.</span>}
            {retriesLeft > 0 && !teaching && ex.kind !== 'match' && (
              <span className="ml-4 text-[12px] text-ink-600">
                {retriesLeft} mistake{retriesLeft === 1 ? '' : 's'} to revisit
              </span>
            )}
          </div>
        )}

        <div className="flex-none">
          {fb && tone ? (
            <Btn tone={tone.btn} onClick={onNext} className="min-w-[150px]">
              Continue
            </Btn>
          ) : teaching ? (
            <Btn onClick={onNext} className="min-w-[150px]">
              Continue
            </Btn>
          ) : ex.kind === 'match' ? null : (
            <Btn tone="success" disabled={!ready} onClick={onCheck} className="min-w-[150px]">
              {scoring ? 'Grading…' : 'Check'}
            </Btn>
          )}
        </div>
      </div>
    </footer>
  )
}

function Preparing({
  title,
  teaser,
  index,
  scope,
  error,
  onRetry,
  onBack
}: {
  title: string
  teaser?: string
  index: number
  scope?: string
  error?: string
  onRetry?: () => void
  onBack: () => void
}) {
  return (
    <div className="py-10">
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-glass-accent2">
        {index >= 0 ? `Lesson ${index + 1}` : 'Lesson'}
      </div>
      <h1 className="text-[28px] font-extrabold leading-tight text-white">{title}</h1>
      {teaser && <p className="mt-2 text-[16px] text-gray-400">{teaser}</p>}
      <div className="mt-8">
        {error ? (
          <div className="rounded-2xl border border-glass-del/30 bg-glass-del/10 p-4">
            <p className="text-[14px] font-bold text-glass-del">Couldn't build this lesson</p>
            <p className="mt-1 line-clamp-3 text-[13px] text-gray-400">{error}</p>
            <div className="mt-4 flex gap-3">
              {onRetry && <Btn onClick={onRetry}>Try again</Btn>}
              <Btn tone="ghost" onClick={onBack}>
                Back
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 text-[15px] text-gray-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-glass-accent2/30 border-t-glass-accent2" />
              Reading the real code to build your lesson…
            </div>
            {scope && <AgentStatus scope={scope} />}
          </>
        )}
      </div>
    </div>
  )
}

function fmtTime(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function ResultsScreen({
  results,
  practice,
  sectionId,
  onContinue,
  onHunt
}: {
  results: Results
  practice: boolean
  sectionId: string | null
  onContinue: () => void
  onHunt: (sectionId: string) => void
}) {
  const section = useStore((s) => (sectionId ? s.sections[sectionId] : undefined))
  const [bonus, setBonus] = useState(false)
  const accLabel = results.accuracy >= 95 ? 'Amazing' : results.accuracy >= 80 ? 'Great' : results.accuracy >= 60 ? 'Good' : 'Accuracy'
  const huntable = (section?.reviewFindings?.length ?? 0) > 0
  const challenge = section?.codingChallenge

  const headline = useMemo(
    () => (practice ? 'Practice complete!' : results.perfect ? 'Perfect lesson!' : 'Lesson complete!'),
    [practice, results.perfect]
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[640px] flex-col items-center px-6 pb-12 pt-10 text-center">
        <motion.div
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 13 }}
          className="text-[84px] leading-none"
        >
          {results.perfect ? '🏆' : '🎉'}
        </motion.div>
        <h1 className="mt-4 text-[32px] font-black text-glass-warm">{headline}</h1>

        <div className="mt-8 grid w-full grid-cols-3 gap-3">
          <StatTile tone="warm" label="Total XP" value={`⚡ ${results.xp}`} delay={0.1} />
          <StatTile tone="green" label={accLabel} value={`🎯 ${results.accuracy}%`} delay={0.2} />
          <StatTile tone="blue" label={results.ms < 150_000 ? 'Speedy' : 'Time'} value={`⏱ ${fmtTime(results.ms)}`} delay={0.3} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-6 space-y-2 text-[15px] text-gray-300"
        >
          <p>
            +<span className="font-bold text-glass-warm">{results.coins}</span> 🪙 coins
          </p>
          {results.extended && (
            <p className="text-[17px] font-extrabold text-glass-warm">
              🔥 {results.streak} day streak{results.streak > 1 ? '!' : ' started!'}
            </p>
          )}
          {results.goalReached && <p className="font-bold text-glass-accent2">⚡ Daily goal reached</p>}
        </motion.div>

        <div className="mt-8 w-full">
          <Btn onClick={onContinue} className="w-full">
            Continue
          </Btn>
        </div>

        {(challenge || huntable) && (
          <div className="mt-8 w-full border-t border-ink-800 pt-6 text-left">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-600">Keep going</div>
            <div className="grid gap-2">
              {challenge && (
                <button
                  onClick={() => setBonus((b) => !b)}
                  className="no-drag flex items-center gap-3 rounded-2xl border-2 border-ink-700 bg-ink-900 px-4 py-3 text-left hover:border-ink-600"
                >
                  <span className="text-[22px]">⚒️</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-white">Bonus: write the code</span>
                    <span className="block truncate text-[12.5px] text-gray-400">{challenge.title}</span>
                  </span>
                  <span className="text-ink-600">{bonus ? '▾' : '▸'}</span>
                </button>
              )}
              {bonus && challenge && sectionId && (
                <div className="py-2">
                  <CodingChallenge challenge={challenge} sectionId={sectionId} />
                </div>
              )}
              {huntable && sectionId && (
                <button
                  onClick={() => onHunt(sectionId)}
                  className="no-drag flex items-center gap-3 rounded-2xl border-2 border-ink-700 bg-ink-900 px-4 py-3 text-left hover:border-ink-600"
                >
                  <span className="text-[22px]">🐛</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-white">Review it: hunt the bugs</span>
                    <span className="block text-[12.5px] text-gray-400">
                      {section!.reviewFindings.length} issue{section!.reviewFindings.length === 1 ? '' : 's'} a reviewer would flag
                    </span>
                  </span>
                  <span className="text-ink-600">▸</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const STAT_TONE = {
  warm: 'border-glass-warm bg-glass-warm',
  green: 'border-[#3fb950] bg-[#3fb950]',
  blue: 'border-glass-accent bg-glass-accent'
}

function StatTile({ tone, label, value, delay }: { tone: keyof typeof STAT_TONE; label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 18 }}
      className={cn('overflow-hidden rounded-2xl border-2', STAT_TONE[tone])}
    >
      <div className="py-1 text-[11px] font-extrabold uppercase tracking-wider text-ink-950">{label}</div>
      <div className="rounded-t-xl bg-ink-950 py-3 text-[19px] font-extrabold text-white">{value}</div>
    </motion.div>
  )
}
