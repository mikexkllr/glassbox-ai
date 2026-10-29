import type {
  DiffSummary,
  InlineExplanation,
  Overview,
  SectionPlan,
  TraceStep,
  WalkChunk,
  WalkthroughSection
} from '@shared/types'
import { ARCH_DONE_KEY, FACET_META, buildArchRounds, type OrderItem } from '../components/ArchRecon'
import { buildChallenge, deriveSymbols } from '../components/Insights'

/**
 * Lessons — the Duolingo/Brilliant loop. A section becomes a short queue of
 * screens where nearly every screen asks the reader to *do* something with the
 * code (predict it, find a line in it, order it, match it) before it explains.
 *
 * Everything here is pure: built from the agent's section payload, so cached
 * sessions get lessons too. The player owns state, grading UI and rewards.
 */

export interface CodeWindow {
  file: string
  startLine: number
  endLine: number
  /** Lines to softly glow (e.g. the other steps of a trace). */
  highlight?: number[]
  /** The one line to call out. */
  active?: number
}

interface Base {
  /** Stable across rebuilds — mistakes are remembered by it for Practice. */
  id: string
  /** One-shot game keys to record once the item is completed (keeps the Read view's mastery in sync). */
  marks?: string[]
  /** A guess-first warm-up item: being wrong is the point, so it is never re-queued or practised. */
  guess?: boolean
}

export type Exercise =
  | (Base & {
      kind: 'learn'
      eyebrow: string
      title: string
      body?: string
      bullets?: string[]
      aside?: { label: string; text: string }
    })
  | (Base & { kind: 'learn-chunk'; chunk: WalkChunk; explanations: InlineExplanation[] })
  | (Base & {
      kind: 'choice'
      eyebrow: string
      prompt: string
      options: string[]
      correct: number
      explanation?: string
      code?: CodeWindow
      explanations?: InlineExplanation[]
      /** Extra context shown under the prompt (e.g. the value one step earlier). */
      context?: string
      /** Options are code/values — render monospace. */
      mono?: boolean
      /** Options have a natural order (sizes) — never shuffle them. */
      ordered?: boolean
    })
  | (Base & {
      kind: 'tapline'
      eyebrow: string
      prompt: string
      /** What to find, in plain words. */
      target: string
      code: CodeWindow
      answer: number
      explanations: InlineExplanation[]
    })
  | (Base & { kind: 'order'; eyebrow: string; prompt: string; items: OrderItem[] /* in the correct order */ })
  | (Base & { kind: 'match'; eyebrow: string; prompt: string; pairs: { left: string; right: string }[] })
  | (Base & {
      kind: 'blank'
      eyebrow: string
      prompt: string
      before: string
      after: string
      answer: string
      options: string[]
    })
  | (Base & { kind: 'explain'; eyebrow: string; prompt: string; answer: string; sectionId: string })

export type ExerciseKind = Exercise['kind']

/** Graded items move the progress bar only when answered right, and count toward accuracy. */
export function isGraded(ex: Exercise): boolean {
  return ex.kind !== 'learn' && ex.kind !== 'learn-chunk' && ex.kind !== 'explain'
}

/** A tap-the-line answer within this many lines counts — agent line numbers can drift by one. */
export const LINE_TOLERANCE = 1

export type Response = number | string | string[] | { mistakes: number } | null

/** Grade a response. `answer` is the human-readable right answer for the feedback sheet. */
export function grade(ex: Exercise, response: Response): { correct: boolean; answer?: string } {
  switch (ex.kind) {
    case 'choice':
      return { correct: response === ex.correct, answer: ex.options[ex.correct] }
    case 'tapline':
      return {
        correct: typeof response === 'number' && Math.abs(response - ex.answer) <= LINE_TOLERANCE,
        answer: `line ${ex.answer}`
      }
    case 'order': {
      const ids = Array.isArray(response) ? response : []
      return {
        correct: ids.length === ex.items.length && ids.every((id, i) => id === ex.items[i].id),
        answer: ex.items.map((it, i) => `${i + 1}. ${it.primary}`).join('\n')
      }
    }
    case 'blank':
      return {
        correct: typeof response === 'string' && response.toLowerCase() === ex.answer.toLowerCase(),
        answer: `${ex.before}${ex.answer}${ex.after}`
      }
    case 'match':
      return { correct: typeof response === 'object' && response !== null && 'mistakes' in response && response.mistakes === 0 }
    default:
      return { correct: true }
  }
}

// ---------------------------------------------------------------------------
// Persistence keys (all per walkthrough — see game/store's scoping)
// ---------------------------------------------------------------------------

export const WARMUP_ID = 'warmup'
export const doneKey = (lessonId: string) => `path:done:${lessonId}`
export const perfectKey = (lessonId: string) => `path:perfect:${lessonId}`
export const missKey = (itemId: string) => `path:miss:${itemId}`
export const fixedKey = (itemId: string) => `path:fixed:${itemId}`

/** Ids of items the reader missed in this walkthrough and hasn't fixed in Practice yet. */
export function outstandingMistakes(rewarded: Record<string, true>): string[] {
  const out: string[] = []
  for (const key of Object.keys(rewarded)) {
    if (!key.startsWith('path:miss:')) continue
    const id = key.slice('path:miss:'.length)
    if (!rewarded[fixedKey(id)]) out.push(id)
  }
  return out
}

/** XP and coins for a finished lesson. One lesson ≈ the daily goal, and ≈ one section's share of the verdict. */
export function lessonPayout(s: { firstTry: number; retried: number; perfect: boolean; practice: boolean }): {
  xp: number
  coins: number
} {
  const earned = s.practice
    ? 30 + 15 * (s.firstTry + s.retried)
    : 80 + 20 * s.firstTry + 10 * s.retried + (s.perfect ? 40 : 0)
  return { xp: earned, coins: earned }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Shuffle a choice's options, keeping track of where the right one lands. */
function shuffledChoice<T extends { options: string[]; correct: number; ordered?: boolean }>(c: T): T {
  if (c.ordered) return c
  const order = shuffle(c.options.map((_, i) => i))
  return { ...c, options: order.map((i) => c.options[i]), correct: order.indexOf(c.correct) }
}

/** A fresh copy for a re-queued attempt, so the right answer isn't in the same spot twice. */
export function reshuffle(ex: Exercise): Exercise {
  if (ex.kind === 'choice') return shuffledChoice(ex)
  if (ex.kind === 'blank') return { ...ex, options: shuffle(ex.options) }
  return ex
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((t) => {
    const k = key(t).trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Hide the symbol inside its own description, so matching it isn't a string search. */
function maskSymbol(text: string, symbol: string): string {
  if (!symbol.trim()) return text
  return text.replace(new RegExp(`\`?\\b${escapeRe(symbol)}\\b\`?`, 'gi'), 'this')
}

function clip(text: string, n: number): string {
  const t = text.trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

function chunkWindow(chunk: WalkChunk): CodeWindow {
  return { file: chunk.file, startLine: chunk.startLine, endLine: Math.max(chunk.startLine, chunk.endLine) }
}

/** A focused code window around one line, inside its block when we know it. */
function windowAround(line: number, file: string, chunks: WalkChunk[], salt: number): CodeWindow {
  const owner = chunks.find((c) => c.file === file && line >= c.startLine && line <= c.endLine)
  // Vary where the target sits so it isn't always the third line down.
  const above = 3 + (salt % 4)
  let lo = Math.max(1, line - above)
  let hi = lo + 13
  if (owner && owner.endLine - owner.startLine >= 5) {
    lo = Math.max(owner.startLine, lo)
    hi = Math.min(owner.endLine, hi)
  }
  if (hi - lo < 5) {
    lo = Math.max(1, line - 3)
    hi = line + 4
  }
  return { file, startLine: lo, endLine: hi }
}

/** "Read the code — what is this block doing?" Prefers the agent's own question. */
function predictFor(chunk: WalkChunk, sectionId: string, pool: string[]): Exercise | null {
  const base = {
    id: `${sectionId}/predict/${chunk.id}`,
    eyebrow: 'Predict',
    code: chunkWindow(chunk)
  }
  const c = chunk.check
  if (c && c.options.length >= 2 && c.correctIndex >= 0 && c.correctIndex < c.options.length) {
    return shuffledChoice({
      ...base,
      kind: 'choice' as const,
      prompt: c.question,
      options: c.options,
      correct: c.correctIndex,
      explanation: c.explanation
    })
  }
  // Older sessions have no per-block question: ask which gist fits this code,
  // with the other blocks' gists as distractors.
  const distractors = uniqueBy(
    pool.filter((g) => g.trim().toLowerCase() !== chunk.gist.trim().toLowerCase()),
    (g) => g
  ).slice(0, 3)
  if (distractors.length < 2) return null
  return shuffledChoice({
    ...base,
    kind: 'choice' as const,
    prompt: 'Read the code first. What is this block doing?',
    options: [chunk.gist, ...distractors],
    correct: 0,
    explanation: chunk.story.what
  })
}

function tapLines(section: WalkthroughSection, sectionId: string): Exercise[] {
  const steps: { name: string; step: TraceStep; key: string }[] = []
  for (const v of section.traceableValues ?? []) {
    v.steps.forEach((step, i) => {
      if (step.label.trim().length >= 10 && step.line >= 1) steps.push({ name: v.name, step, key: `${v.id}:${i}` })
    })
  }
  // Prefer steps from different traces, then by order of appearance.
  const picked: typeof steps = []
  const names = new Set<string>()
  for (const s of steps) {
    if (picked.length === 2) break
    if (names.has(s.name)) continue
    names.add(s.name)
    picked.push(s)
  }
  for (const s of steps) {
    if (picked.length === 2) break
    if (!picked.includes(s)) picked.push(s)
  }

  return uniqueBy(picked, (s) => s.step.label).map((s, i) => ({
    kind: 'tapline' as const,
    id: `${sectionId}/tap/${s.key}`,
    eyebrow: 'Find it',
    prompt: 'Tap the line where this happens',
    target: s.step.label,
    code: windowAround(s.step.line, s.step.file, section.chunks, i + s.step.line),
    answer: s.step.line,
    explanations: section.inlineExplanations ?? []
  }))
}

function matchPairs(section: WalkthroughSection, sectionId: string): Exercise | null {
  const inChunk = (e: InlineExplanation) =>
    section.chunks.some((c) => c.file === e.file && e.line >= c.startLine && e.line <= c.endLine)
  const candidates = uniqueBy(
    uniqueBy(
      (section.inlineExplanations ?? []).filter((e) => e.symbol.trim().length >= 2 && e.gist.trim().length >= 8),
      (e) => e.symbol
    ),
    (e) => e.gist
  ).sort((a, b) => Number(inChunk(b)) - Number(inChunk(a)))
  if (candidates.length < 3) return null
  return {
    kind: 'match',
    id: `${sectionId}/match`,
    eyebrow: 'Match',
    prompt: 'Match each name to what it is',
    pairs: candidates.slice(0, 4).map((e) => ({ left: e.symbol, right: clip(maskSymbol(e.gist, e.symbol).replace(/`/g, ''), 110) }))
  }
}

function orderSteps(section: WalkthroughSection, sectionId: string): Exercise | null {
  const v = (section.traceableValues ?? []).find((t) => {
    if (t.steps.length < 3 || t.steps.length > 6) return false
    return uniqueBy(t.steps, (s) => s.label).length === t.steps.length
  })
  if (!v) return null
  return {
    kind: 'order',
    id: `${sectionId}/order/${v.id}`,
    eyebrow: 'Order',
    prompt: `Put the steps in the order ${v.name} flows through them`,
    items: v.steps.map((s, i) => ({ id: `s${i}`, primary: s.label })),
    marks: [`trace:${sectionId}:${v.id}`]
  }
}

function predictValue(section: WalkthroughSection, sectionId: string): Exercise | null {
  const traces = section.traceableValues ?? []
  const allValues = uniqueBy(
    traces.flatMap((t) => t.steps.map((s) => s.exampleValue ?? '')).filter(Boolean),
    (v) => v
  )
  if (allValues.length < 3) return null
  // The richest trace, and a step past its first — a value that had to be worked out.
  const trace = [...traces].sort(
    (a, b) => b.steps.filter((s) => s.exampleValue).length - a.steps.filter((s) => s.exampleValue).length
  )[0]
  const valued = trace.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.exampleValue)
  const target = valued.length > 1 ? valued[valued.length - 1] : valued[0]
  if (!target) return null
  const answer = target.s.exampleValue!
  const sameTrace = trace.steps.map((s) => s.exampleValue ?? '').filter(Boolean)
  const distractors = uniqueBy(
    [...sameTrace, ...allValues].filter((v) => v.trim().toLowerCase() !== answer.trim().toLowerCase()),
    (v) => v
  ).slice(0, 3)
  if (distractors.length < 2) return null
  const prev = valued.filter(({ i }) => i < target.i).pop()
  const code = windowAround(target.s.line, target.s.file, section.chunks, target.i)
  return shuffledChoice({
    kind: 'choice' as const,
    id: `${sectionId}/value/${trace.id}`,
    eyebrow: 'Predict the value',
    prompt: `What does ${trace.name} hold at the highlighted line?`,
    context: prev ? `Earlier — ${prev.s.label}: ${prev.s.exampleValue}` : trace.description,
    options: [answer, ...distractors],
    correct: 0,
    explanation: target.s.label,
    code: { ...code, active: target.s.line },
    explanations: section.inlineExplanations ?? [],
    mono: true
  })
}

/** Insights become fill-the-blank when a real code symbol can be blanked; otherwise a short read. */
function insightItems(section: WalkthroughSection, sectionId: string): { blanks: Exercise[]; reads: Exercise[] } {
  const insights = section.insights ?? []
  const symbols = deriveSymbols(section.inlineExplanations)
  const known = new Set(symbols.map((s) => s.toLowerCase()))
  const blanks: Exercise[] = []
  const reads: Exercise[] = []
  insights.forEach((text, i) => {
    const marks = [`insight:${sectionId}:${i}`]
    const ch = buildChallenge(text, symbols, insights, i)
    const honest = ch && ch.options.every((o) => known.has(o.toLowerCase()))
    const parts = ch?.blanked.split('▮▮▮▮')
    if (ch && honest && parts && parts.length === 2) {
      blanks.push({
        kind: 'blank',
        id: `${sectionId}/blank/${i}`,
        eyebrow: 'Fill the gap',
        prompt: 'Complete the insight',
        before: parts[0],
        after: parts[1],
        answer: ch.answer,
        options: ch.options,
        marks: [...marks, `insightlock:${sectionId}:${i}`]
      })
    } else if (reads.length < 2) {
      reads.push({ kind: 'learn', id: `${sectionId}/insight/${i}`, eyebrow: '💡 Insight', title: 'Worth knowing', body: text, marks })
    }
  })
  return { blanks: blanks.slice(0, 2), reads }
}

/** At most this many blocks get the predict → explain treatment per lesson. */
const MAX_CHUNKS = 5

/**
 * One section as a lesson:
 *   intro → (predict a block → read its story) × blocks → insights →
 *   mixed practice (find the line, match, fill, order, predict a value) →
 *   quiz → explain it in your own words.
 */
export function buildSectionLesson(
  plan: SectionPlan,
  section: WalkthroughSection,
  others: WalkthroughSection[],
  index: number
): Exercise[] {
  const sid = plan.id
  const items: Exercise[] = []
  const chunks = section.chunks.slice(0, MAX_CHUNKS)
  const quiz = (section.quiz ?? []).filter((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length)

  items.push({
    kind: 'learn',
    id: `${sid}/intro`,
    eyebrow: `Lesson ${index + 1}`,
    title: section.title || plan.title,
    body: section.plainSummaryGist || plan.teaser,
    bullets: [
      chunks.length ? `${chunks.length} code block${chunks.length === 1 ? '' : 's'} to read` : '',
      'You predict first — the explanation comes after',
      quiz.length ? `${quiz.length} question${quiz.length === 1 ? '' : 's'} to check yourself` : ''
    ].filter(Boolean)
  })

  // Distractor pool for gist questions: this section's blocks first, then others'.
  const pool = [
    ...section.chunks.map((c) => c.gist),
    ...others.filter((o) => o.id !== section.id).flatMap((o) => o.chunks.map((c) => c.gist))
  ]
  for (const chunk of chunks) {
    const predict = predictFor(chunk, sid, pool)
    if (predict) items.push(predict)
    items.push({
      kind: 'learn-chunk',
      id: `${sid}/read/${chunk.id}`,
      chunk,
      explanations: section.inlineExplanations ?? [],
      marks: [`story:${chunk.file}:${chunk.id}`]
    })
  }

  const { blanks, reads } = insightItems(section, sid)
  items.push(...reads)

  const taps = tapLines(section, sid)
  const practice = [
    taps[0],
    matchPairs(section, sid),
    blanks[0],
    orderSteps(section, sid),
    predictValue(section, sid),
    taps[1],
    blanks[1]
  ].filter((x): x is Exercise => !!x)
  items.push(...practice)

  for (const q of quiz) {
    items.push(
      shuffledChoice({
        kind: 'choice' as const,
        id: `${sid}/quiz/${q.id}`,
        eyebrow: 'Check yourself',
        prompt: q.question,
        options: q.options,
        correct: q.correctIndex,
        explanation: q.explanation,
        marks: [`quizsolved:${sid}:${q.id}`]
      })
    )
  }

  if (section.selfCheck?.prompt && section.selfCheck.answer) {
    items.push({
      kind: 'explain',
      id: `${sid}/explain`,
      eyebrow: 'In your own words',
      prompt: section.selfCheck.prompt,
      answer: section.selfCheck.answer,
      sectionId: sid,
      marks: [`selfcheck:${sid}`]
    })
  }
  return withUniqueIds(items)
}

/** The model picks chunk/quiz ids; if it repeats one, keep lesson items distinct anyway. */
function withUniqueIds(items: Exercise[]): Exercise[] {
  const seen = new Map<string, number>()
  return items.map((ex) => {
    const n = seen.get(ex.id) ?? 0
    seen.set(ex.id, n + 1)
    return n === 0 ? ex : { ...ex, id: `${ex.id}~${n}` }
  })
}

/** Guess the architecture before reading any of it, then see the real big picture. */
export function buildWarmupLesson(overview: Overview, diff: DiffSummary | null): Exercise[] {
  const rounds = buildArchRounds(overview, diff)
  if (rounds.length === 0) return []
  const items: Exercise[] = [
    {
      kind: 'learn',
      id: `${WARMUP_ID}/intro`,
      eyebrow: '🛰 Warm-up',
      title: 'First, guess.',
      body: "You haven't read a line yet — perfect. Call the shape of this change now. Being wrong here is the point: it's exactly what the lessons will fix."
    }
  ]
  for (const r of rounds) {
    if (r.kind === 'scale') {
      items.push({
        kind: 'choice',
        id: `${WARMUP_ID}/scale`,
        eyebrow: '📐 Size',
        prompt: 'How much code does this change touch?',
        options: r.options,
        correct: r.correctIndex,
        explanation: `It touches ${r.detail}.`,
        ordered: true,
        guess: true,
        marks: [r.key]
      })
    } else if (r.kind === 'order') {
      items.push({ kind: 'order', id: `${WARMUP_ID}/${r.key}`, eyebrow: r.title, prompt: r.prompt, items: r.items, guess: true, marks: [r.key] })
    } else {
      const facet = FACET_META[r.q.facet] ?? FACET_META.shape
      items.push(
        shuffledChoice({
          kind: 'choice' as const,
          id: `${WARMUP_ID}/q/${r.q.id}`,
          eyebrow: `${facet.emoji} ${facet.label}`,
          prompt: r.q.question,
          options: r.q.options,
          correct: r.q.correctIndex,
          explanation: r.q.explanation,
          guess: true,
          marks: [r.key]
        })
      )
    }
  }
  items.push({
    kind: 'learn',
    id: `${WARMUP_ID}/bigpicture`,
    eyebrow: '✦ The big picture',
    title: overview.title,
    body: overview.whatDeep || overview.whatGist,
    bullets: overview.highlights,
    aside: overview.why ? { label: 'Why', text: overview.why } : undefined,
    marks: [ARCH_DONE_KEY]
  })
  return items
}

/** Every graded item across the loaded lessons — what Practice draws from. */
function allGraded(
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null
): Exercise[] {
  const loaded = overview.sections.map((p) => sections[p.id]).filter(Boolean)
  const out = buildWarmupLesson(overview, diff).filter(isGraded)
  overview.sections.forEach((plan, i) => {
    const section = sections[plan.id]
    if (section) out.push(...buildSectionLesson(plan, section, loaded, i).filter(isGraded))
  })
  return out
}

/** A practice lesson from the items the reader missed and hasn't fixed yet. */
export function buildPracticeLesson(
  missed: string[],
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null
): Exercise[] {
  const want = new Set(missed)
  const picked = shuffle(allGraded(overview, sections, diff).filter((ex) => want.has(ex.id) && !ex.guess)).slice(0, 12)
  return picked.map((ex) => ({ ...ex, marks: [...(ex.marks ?? []), fixedKey(ex.id)] }))
}

/** How many practice items the reader could actually play right now. */
export function practiceCount(
  missed: string[],
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null
): number {
  if (missed.length === 0) return 0
  const want = new Set(missed)
  return allGraded(overview, sections, diff).filter((ex) => want.has(ex.id) && !ex.guess).length
}
