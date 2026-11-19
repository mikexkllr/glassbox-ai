import type {
  DiffSummary,
  InlineExplanation,
  Overview,
  PlainTerm,
  SectionPlan,
  TraceStep,
  WalkChunk,
  WalkthroughSection
} from '@shared/types'
import type { Strings } from './i18n'
import { ARCH_DONE_KEY, FACET_META, buildArchRounds, type OrderItem } from '../components/ArchRecon'
import { buildChallenge, deriveSymbols } from '../components/Insights'

/**
 * Lessons — the Duolingo/Brilliant loop. A section becomes a SHORT queue of
 * screens that teaches before it tests:
 *
 *   the idea in plain words (+ the words you need)
 *     → per block: a simplified 4-liner → predict the real code → its story
 *       → a couple of exercises → at most two questions → say it yourself
 *
 * Nothing asks the reader about code they haven't been introduced to, and a
 * lesson stays at roughly a dozen screens so it fits in one sitting.
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
  /** The plain-language idea of a section, before any of its code. */
  | (Base & {
      kind: 'idea'
      eyebrow: string
      title: string
      idea: string
      analogy?: string
      terms: PlainTerm[]
      bullets?: string[]
      aside?: { label: string; text: string }
    })
  /** The idea with the noise removed: a few invented lines, then the real thing. */
  | (Base & {
      kind: 'mini'
      eyebrow: string
      title: string
      /** The file the real block lives in — only used to pick a highlighter language. */
      file: string
      caption: string
      code: string
      note: string
      next: string
    })
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
  return !TEACHING.has(ex.kind) && ex.kind !== 'explain'
}

/** Screens that only explain — no answer, just Continue. */
export const TEACHING: ReadonlySet<ExerciseKind> = new Set<ExerciseKind>(['idea', 'mini', 'learn', 'learn-chunk'])

export function isTeaching(ex: Exercise): boolean {
  return TEACHING.has(ex.kind)
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
function predictFor(chunk: WalkChunk, sectionId: string, pool: string[], s: Strings): Exercise | null {
  const base = {
    id: `${sectionId}/predict/${chunk.id}`,
    eyebrow: s.eyebrowPredict,
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
    prompt: s.predictFallback,
    options: [chunk.gist, ...distractors],
    correct: 0,
    explanation: chunk.story.what
  })
}

function tapLines(section: WalkthroughSection, sectionId: string, s: Strings): Exercise[] {
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

  return uniqueBy(picked, (t) => t.step.label).map((t, i) => ({
    kind: 'tapline' as const,
    id: `${sectionId}/tap/${t.key}`,
    eyebrow: s.eyebrowFindIt,
    prompt: s.tapLinePrompt,
    target: t.step.label,
    code: windowAround(t.step.line, t.step.file, section.chunks, i + t.step.line),
    answer: t.step.line,
    explanations: section.inlineExplanations ?? []
  }))
}

/**
 * Matching the section's own vocabulary (what does "worktree" mean?) is kinder
 * than matching its identifiers, and it drills exactly the words the rest of
 * the lesson leans on — so it wins whenever the primer gave us enough of them.
 */
function matchTerms(section: WalkthroughSection, sectionId: string, s: Strings): Exercise | null {
  const terms = uniqueBy(
    uniqueBy((section.primer?.terms ?? []).filter((t) => t.term.trim() && t.plain.trim().length >= 8), (t) => t.term),
    (t) => t.plain
  )
  if (terms.length < 3) return null
  return {
    kind: 'match',
    id: `${sectionId}/terms`,
    eyebrow: s.eyebrowMatch,
    prompt: s.matchTermsPrompt,
    pairs: terms.slice(0, 4).map((t) => ({ left: t.term, right: clip(maskSymbol(t.plain, t.term).replace(/`/g, ''), 110) }))
  }
}

function matchPairs(section: WalkthroughSection, sectionId: string, s: Strings): Exercise | null {
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
    eyebrow: s.eyebrowMatch,
    prompt: s.matchNamesPrompt,
    pairs: candidates.slice(0, 4).map((e) => ({ left: e.symbol, right: clip(maskSymbol(e.gist, e.symbol).replace(/`/g, ''), 110) }))
  }
}

function orderSteps(section: WalkthroughSection, sectionId: string, s: Strings): Exercise | null {
  const v = (section.traceableValues ?? []).find((t) => {
    if (t.steps.length < 3 || t.steps.length > 6) return false
    return uniqueBy(t.steps, (s) => s.label).length === t.steps.length
  })
  if (!v) return null
  return {
    kind: 'order',
    id: `${sectionId}/order/${v.id}`,
    eyebrow: s.eyebrowOrder,
    prompt: s.orderPrompt(v.name),
    items: v.steps.map((s, i) => ({ id: `s${i}`, primary: s.label })),
    marks: [`trace:${sectionId}:${v.id}`]
  }
}

function predictValue(section: WalkthroughSection, sectionId: string, s: Strings): Exercise | null {
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
    eyebrow: s.eyebrowValue,
    prompt: s.valuePrompt(trace.name),
    context: prev ? s.valueEarlier(prev.s.label, prev.s.exampleValue!) : trace.description,
    options: [answer, ...distractors],
    correct: 0,
    explanation: target.s.label,
    code: { ...code, active: target.s.line },
    explanations: section.inlineExplanations ?? [],
    mono: true
  })
}

/** Insights become fill-the-blank when a real code symbol can be blanked; otherwise a short read. */
function insightItems(section: WalkthroughSection, sectionId: string, s: Strings): { blanks: Exercise[]; reads: Exercise[] } {
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
        eyebrow: s.eyebrowFill,
        prompt: s.completeInsight,
        before: parts[0],
        after: parts[1],
        answer: ch.answer,
        options: ch.options,
        marks: [...marks, `insightlock:${sectionId}:${i}`]
      })
    } else if (reads.length < 1) {
      reads.push({ kind: 'learn', id: `${sectionId}/insight/${i}`, eyebrow: s.eyebrowInsight, title: s.goodToKnow, body: text, marks })
    }
  })
  return { blanks: blanks.slice(0, 1), reads }
}

/**
 * Caps that keep a lesson sittable. Three blocks, two questions and two
 * exercises is about twelve screens — half of what this used to be, which is
 * what made it feel like homework instead of a lesson.
 */
const MAX_CHUNKS = 3
const MAX_QUIZ = 2
const MAX_PRACTICE = 2

/**
 * One section as a lesson:
 *   the idea in plain words → per block (simplified 4-liner → predict the real
 *   code → its story) → one insight → two exercises → two questions →
 *   say it in your own words.
 */
export function buildSectionLesson(
  plan: SectionPlan,
  section: WalkthroughSection,
  others: WalkthroughSection[],
  index: number,
  s: Strings
): Exercise[] {
  const sid = plan.id
  const items: Exercise[] = []
  const chunks = section.chunks.slice(0, MAX_CHUNKS)
  const quiz = (section.quiz ?? [])
    .filter((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length)
    .slice(0, MAX_QUIZ)
  const primer = section.primer

  // Screen one teaches the idea — in everyday words, with the vocabulary the
  // rest of the lesson needs. Older cached sections have no primer, so fall
  // back to the plain summary rather than showing an empty screen.
  items.push({
    kind: 'idea',
    id: `${sid}/idea`,
    eyebrow: s.lessonN(index + 1),
    title: section.title || plan.title,
    idea: primer?.idea?.trim() || section.plainSummaryGist || plan.teaser,
    analogy: primer?.analogy?.trim() || undefined,
    terms: primer?.terms ?? [],
    bullets: [
      chunks.length ? s.blocksToRead(chunks.length) : '',
      s.predictFirstBullet,
      quiz.length ? s.questionsToCheck(quiz.length) : ''
    ].filter(Boolean)
  })

  // Distractor pool for gist questions: this section's blocks first, then others'.
  const pool = [
    ...section.chunks.map((c) => c.gist),
    ...others.filter((o) => o.id !== section.id).flatMap((o) => o.chunks.map((c) => c.gist))
  ]
  for (const chunk of chunks) {
    // Meet the idea on invented, noise-free code first; the real block then
    // reads as a variation of something already understood.
    if (chunk.mini?.code?.trim()) {
      items.push({
        kind: 'mini',
        id: `${sid}/mini/${chunk.id}`,
        eyebrow: s.eyebrowSimplified,
        title: chunk.title,
        file: chunk.file,
        caption: chunk.mini.caption,
        code: chunk.mini.code.replace(/\s+$/, ''),
        note: s.simplifiedNote,
        next: s.thenTheRealCode
      })
    }
    const predict = predictFor(chunk, sid, pool, s)
    if (predict) items.push(predict)
    items.push({
      kind: 'learn-chunk',
      id: `${sid}/read/${chunk.id}`,
      chunk,
      explanations: section.inlineExplanations ?? [],
      marks: [`story:${chunk.file}:${chunk.id}`]
    })
  }

  const { blanks, reads } = insightItems(section, sid, s)
  items.push(...reads)

  const taps = tapLines(section, sid, s)
  // Vocabulary first, then the gentler drills — and only a couple of them.
  const practice = [
    matchTerms(section, sid, s),
    taps[0],
    blanks[0],
    orderSteps(section, sid, s),
    predictValue(section, sid, s),
    matchPairs(section, sid, s)
  ]
    .filter((x): x is Exercise => !!x)
    .slice(0, MAX_PRACTICE)
  items.push(...practice)

  for (const q of quiz) {
    items.push(
      shuffledChoice({
        kind: 'choice' as const,
        id: `${sid}/quiz/${q.id}`,
        eyebrow: s.eyebrowCheck,
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
      eyebrow: s.eyebrowOwnWords,
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
export function buildWarmupLesson(overview: Overview, diff: DiffSummary | null, s: Strings): Exercise[] {
  const rounds = buildArchRounds(overview, diff, s)
  if (rounds.length === 0) return []
  const items: Exercise[] = [
    {
      kind: 'learn',
      id: `${WARMUP_ID}/intro`,
      eyebrow: s.eyebrowWarmup,
      title: s.warmupTitle,
      body: s.warmupBody
    }
  ]
  for (const r of rounds) {
    if (r.kind === 'scale') {
      items.push({
        kind: 'choice',
        id: `${WARMUP_ID}/scale`,
        eyebrow: s.eyebrowSize,
        prompt: s.scalePrompt,
        options: r.options,
        correct: r.correctIndex,
        explanation: s.scaleExplanation(r.detail ?? ''),
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
          eyebrow: `${facet.emoji} ${s.facets[r.q.facet] ?? s.facets.shape}`,
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
  // The reveal: the whole change in everyday words, plus the vocabulary the
  // lessons are about to use.
  items.push({
    kind: 'idea',
    id: `${WARMUP_ID}/bigpicture`,
    eyebrow: s.eyebrowBigPicture,
    title: overview.title,
    idea: overview.primer?.idea?.trim() || overview.whatDeep || overview.whatGist,
    analogy: overview.primer?.analogy?.trim() || undefined,
    terms: overview.primer?.terms ?? [],
    bullets: overview.highlights,
    aside: overview.why ? { label: s.whyLabel, text: overview.why } : undefined,
    marks: [ARCH_DONE_KEY]
  })
  return items
}

/** Every graded item across the loaded lessons — what Practice draws from. */
function allGraded(
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null,
  s: Strings
): Exercise[] {
  const loaded = overview.sections.map((p) => sections[p.id]).filter(Boolean)
  const out = buildWarmupLesson(overview, diff, s).filter(isGraded)
  overview.sections.forEach((plan, i) => {
    const section = sections[plan.id]
    if (section) out.push(...buildSectionLesson(plan, section, loaded, i, s).filter(isGraded))
  })
  return out
}

/** A practice lesson from the items the reader missed and hasn't fixed yet. */
export function buildPracticeLesson(
  missed: string[],
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null,
  s: Strings
): Exercise[] {
  const want = new Set(missed)
  const picked = shuffle(allGraded(overview, sections, diff, s).filter((ex) => want.has(ex.id) && !ex.guess)).slice(0, 10)
  return picked.map((ex) => ({ ...ex, marks: [...(ex.marks ?? []), fixedKey(ex.id)] }))
}

/** How many practice items the reader could actually play right now. */
export function practiceCount(
  missed: string[],
  overview: Overview,
  sections: Record<string, WalkthroughSection>,
  diff: DiffSummary | null,
  s: Strings
): number {
  if (missed.length === 0) return 0
  const want = new Set(missed)
  return allGraded(overview, sections, diff, s).filter((ex) => want.has(ex.id) && !ex.guess).length
}
