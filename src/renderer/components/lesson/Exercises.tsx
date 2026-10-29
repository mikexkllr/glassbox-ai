import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { InlineExplanation, WalkChunk } from '@shared/types'
import type { CodeWindow, Exercise, Response } from '../../lib/lessons'
import { useGame } from '../../game/store'
import { play } from '../../game/sfx'
import { cn } from '../../lib/files'
import PokeableCode from '../PokeableCode'
import WhyThis from '../WhyThis'
import { Eyebrow, KeyBadge, tileClass, type TileState } from './ui'

type Of<K extends Exercise['kind']> = Extract<Exercise, { kind: K }>

export interface ExProps<E> {
  ex: E
  response: Response
  setResponse: (r: Response) => void
  /** After Check: the answer is frozen and marked right/wrong. */
  locked: boolean
  correct: boolean | null
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const base = (p: string) => p.split('/').pop() ?? p

function Prompt({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[23px] font-extrabold leading-snug text-white">{children}</h2>
}

export function CodeCard({
  code,
  explanations,
  onLineClick,
  lineClass
}: {
  code: CodeWindow
  explanations: InlineExplanation[]
  onLineClick?: (line: number) => void
  lineClass?: (line: number) => string | false | undefined
}) {
  const glow = useMemo(() => new Set(code.highlight ?? []), [code.highlight])
  return (
    <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-850 px-3 py-1.5 font-mono text-[11px] text-ink-600">
        <span className="truncate" title={code.file}>
          {code.file}
        </span>
        <span className="flex-none">
          {code.startLine}–{code.endLine}
        </span>
      </div>
      <div className="max-h-[340px] overflow-y-auto py-1.5">
        <PokeableCode
          file={code.file}
          startLine={code.startLine}
          endLine={code.endLine}
          explanations={explanations}
          traceLines={glow}
          activeLine={code.active ?? null}
          quiet
          onLineClick={onLineClick}
          lineClass={lineClass}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teaching screens
// ---------------------------------------------------------------------------

export function LearnCard({ ex }: { ex: Of<'learn'> }) {
  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <h1 className="text-[30px] font-extrabold leading-tight text-white">{ex.title}</h1>
      {ex.body && <p className="mt-4 text-[17px] leading-relaxed text-gray-200">{ex.body}</p>}
      {ex.aside && (
        <div className="mt-5 rounded-2xl border border-glass-accent/25 bg-glass-accent/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-glass-accent">{ex.aside.label}</div>
          <p className="mt-1 text-[15px] leading-relaxed text-gray-200">{ex.aside.text}</p>
        </div>
      )}
      {ex.bullets && ex.bullets.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {ex.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-gray-200">
              <span className="mt-[3px] flex h-5 w-5 flex-none items-center justify-center rounded-full bg-glass-accent2/15 text-[11px] text-glass-accent2">
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CHANGE_META: Record<string, { label: string; cls: string }> = {
  added: { label: 'Added', cls: 'bg-glass-add/15 text-glass-add' },
  modified: { label: 'Changed', cls: 'bg-glass-accent/15 text-glass-accent' },
  removed: { label: 'Removed', cls: 'bg-glass-del/15 text-glass-del' },
  context: { label: 'Explore', cls: 'bg-glass-accent2/15 text-glass-accent2' }
}

/** The explanation that follows a prediction: the same code, now with its story. */
export function LearnChunkCard({ chunk, explanations }: { chunk: WalkChunk; explanations: InlineExplanation[] }) {
  const meta = CHANGE_META[chunk.changeKind] ?? CHANGE_META.modified
  const calledBy = chunk.story.calledBy?.trim()
  return (
    <div>
      <Eyebrow>
        <span className={cn('mr-2 rounded px-1.5 py-0.5 text-[10px] tracking-wider', meta.cls)}>{meta.label}</span>
        <span className="font-mono normal-case tracking-normal text-ink-600">
          {base(chunk.file)}:{chunk.startLine}
        </span>
      </Eyebrow>
      <h1 className="text-[25px] font-extrabold leading-tight text-white">{chunk.title}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-gray-100">{chunk.gist}</p>
      <div className="mt-4">
        <CodeCard
          code={{ file: chunk.file, startLine: chunk.startLine, endLine: Math.max(chunk.startLine, chunk.endLine) }}
          explanations={explanations}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-600">Hover an underlined name to see what it is.</p>
      <div className="mt-4 space-y-3">
        <StoryRow icon="⚙️" label="What it does" text={chunk.story.what} />
        <StoryRow icon="🧩" label="How it fits" text={chunk.story.fits} />
        {calledBy && calledBy.toLowerCase() !== 'n/a' && <StoryRow icon="📞" label="Who calls it" text={calledBy} />}
        {chunk.story.gotcha && (
          <div className="rounded-xl border border-glass-warm/30 bg-glass-warm/5 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-glass-warm">⚠ Watch out</div>
            <p className="mt-1 text-[14.5px] leading-relaxed text-gray-200">{chunk.story.gotcha}</p>
          </div>
        )}
      </div>
      <div className="mt-4">
        <WhyThis context={`${chunk.title} (${chunk.file}:${chunk.startLine}-${chunk.endLine}). ${chunk.gist}. ${chunk.story.what}`} />
      </div>
    </div>
  )
}

function StoryRow({ icon, label, text }: { icon: string; label: string; text: string }) {
  if (!text?.trim()) return null
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-ink-850 text-[14px]">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-600">{label}</div>
        <p className="text-[15px] leading-relaxed text-gray-200">{text}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export function ChoiceEx({ ex, response, setResponse, locked }: ExProps<Of<'choice'>>) {
  const short = ex.options.every((o) => o.length <= 30)
  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      {ex.context && <p className="mt-2 text-[14px] leading-relaxed text-gray-400">{ex.context}</p>}
      {ex.code && (
        <div className="mt-4">
          <CodeCard code={ex.code} explanations={ex.explanations ?? []} />
        </div>
      )}
      <div className={cn('mt-5 grid gap-2.5', short ? 'grid-cols-2' : 'grid-cols-1')}>
        {ex.options.map((opt, i) => {
          const state: TileState = locked
            ? i === ex.correct
              ? 'correct'
              : i === response
                ? 'wrong'
                : 'dim'
            : response === i
              ? 'selected'
              : 'idle'
          return (
            <motion.button
              key={`${i}-${opt}`}
              type="button"
              disabled={locked}
              onClick={() => setResponse(i)}
              animate={state === 'wrong' ? { x: [0, -7, 7, -4, 4, 0] } : {}}
              transition={{ duration: 0.35 }}
              className={cn(tileClass(state), 'flex items-center gap-3 px-4 py-3 text-[15px] leading-snug')}
            >
              <KeyBadge n={i + 1} state={state} />
              <span className={ex.mono ? 'break-all font-mono text-[13.5px]' : ''}>{opt}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export function TapLineEx({ ex, response, setResponse, locked, correct }: ExProps<Of<'tapline'>>) {
  const picked = typeof response === 'number' ? response : null
  const lineClass = (ln: number) => {
    if (locked) {
      if (ln === ex.answer) return 'line-answer'
      if (ln === picked && !correct) return 'line-wrong'
      return undefined
    }
    return ln === picked ? 'line-picked' : undefined
  }
  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      <div className="mt-3 rounded-xl border-l-4 border-glass-accent2 bg-ink-900 px-4 py-3 text-[16px] leading-relaxed text-gray-100">
        {ex.target}
      </div>
      <div className="mt-4">
        <CodeCard
          code={ex.code}
          explanations={ex.explanations}
          onLineClick={locked ? undefined : (ln) => setResponse(ln)}
          lineClass={lineClass}
        />
      </div>
      <p className="mt-2 text-[12px] text-ink-600">
        {picked === null ? 'Tap a line in the code.' : `Line ${picked} selected — tap another to change it.`}
      </p>
    </div>
  )
}

export function OrderEx({ ex, response, setResponse, locked }: ExProps<Of<'order'>>) {
  // Shuffle the bank once per attempt, and never into the answer itself.
  const bank = useMemo(() => {
    if (ex.items.length < 2) return ex.items
    let s = shuffle(ex.items)
    for (let tries = 0; tries < 6 && s.every((it, i) => it.id === ex.items[i].id); tries++) s = shuffle(ex.items)
    return s
  }, [ex])
  const placed = Array.isArray(response) ? response : []
  const byId = useMemo(() => new Map(ex.items.map((it) => [it.id, it])), [ex])

  const place = (id: string) => !locked && !placed.includes(id) && setResponse([...placed, id])
  const remove = (id: string) => !locked && setResponse(placed.filter((x) => x !== id))

  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      <p className="mt-1.5 text-[13px] text-ink-600">Tap the cards in order. Tap a placed card to send it back.</p>

      <ol className="mt-5 space-y-2">
        {ex.items.map((_, i) => {
          const id = placed[i]
          const it = id ? byId.get(id) : null
          const state: TileState = !it ? 'idle' : locked ? (id === ex.items[i].id ? 'correct' : 'wrong') : 'selected'
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="w-5 flex-none text-right font-mono text-[13px] text-ink-600">{i + 1}</span>
              {it ? (
                <button type="button" onClick={() => remove(it.id)} className={cn(tileClass(state), 'flex-1 px-4 py-2.5 text-[14.5px]')}>
                  {it.primary}
                  {it.secondary && <span className="ml-2 font-mono text-[11px] text-ink-600">{it.secondary}</span>}
                </button>
              ) : (
                <div className="h-[46px] flex-1 rounded-xl border-2 border-dashed border-ink-700" />
              )}
            </li>
          )
        })}
      </ol>

      {!locked && (
        <div className="mt-6 border-t border-ink-800 pt-5">
          <div className="flex flex-wrap gap-2">
            {bank.map((it) => {
              const used = placed.includes(it.id)
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={used}
                  onClick={() => place(it.id)}
                  className={cn(tileClass('idle'), 'px-4 py-2.5 text-[14px]', used && 'pointer-events-none opacity-0')}
                >
                  {it.primary}
                  {it.secondary && <span className="ml-2 font-mono text-[11px] text-ink-600">{it.secondary}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Tap a name, then what it is. Wrong pairs flash red; the exercise checks itself once every pair is found. */
export function MatchEx({
  ex,
  locked,
  onDone
}: {
  ex: Of<'match'>
  locked: boolean
  onDone: (mistakes: number) => void
}) {
  const sfxOn = useGame((s) => s.sfxOn)
  const left = useMemo(() => shuffle(ex.pairs.map((p, i) => ({ i, text: p.left }))), [ex])
  const right = useMemo(() => shuffle(ex.pairs.map((p, i) => ({ i, text: p.right }))), [ex])
  const [selL, setSelL] = useState<number | null>(null)
  const [selR, setSelR] = useState<number | null>(null)
  const [matched, setMatched] = useState<number[]>([])
  const [miss, setMiss] = useState<{ l: number; r: number } | null>(null)
  const [mistakes, setMistakes] = useState(0)

  const attempt = (l: number, r: number) => {
    setSelL(null)
    setSelR(null)
    if (l === r) {
      const next = [...matched, l]
      setMatched(next)
      if (sfxOn) play('tick')
      if (next.length === ex.pairs.length) setTimeout(() => onDone(mistakes), 250)
    } else {
      setMistakes((m) => m + 1)
      setMiss({ l, r })
      if (sfxOn) play('wrong')
      setTimeout(() => setMiss(null), 550)
    }
  }
  const pick = (side: 'l' | 'r', i: number) => {
    if (locked || matched.includes(i) || miss) return
    if (side === 'l') {
      if (selR !== null) attempt(i, selR)
      else setSelL(selL === i ? null : i)
    } else {
      if (selL !== null) attempt(selL, i)
      else setSelR(selR === i ? null : i)
    }
  }
  const stateOf = (side: 'l' | 'r', i: number): TileState => {
    if (locked || matched.includes(i)) return 'correct'
    if (miss && (side === 'l' ? miss.l : miss.r) === i) return 'wrong'
    if ((side === 'l' ? selL : selR) === i) return 'selected'
    return 'idle'
  }

  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      <div className="mt-5 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <div className="space-y-2.5">
          {left.map(({ i, text }) => (
            <motion.button
              key={i}
              type="button"
              onClick={() => pick('l', i)}
              animate={stateOf('l', i) === 'wrong' ? { x: [0, -6, 6, -3, 3, 0] } : {}}
              className={cn(
                tileClass(stateOf('l', i)),
                'flex min-h-[64px] w-full items-center break-all px-4 py-2.5 font-mono text-[13.5px]',
                matched.includes(i) && !locked && 'opacity-50'
              )}
            >
              {text}
            </motion.button>
          ))}
        </div>
        <div className="space-y-2.5">
          {right.map(({ i, text }) => (
            <motion.button
              key={i}
              type="button"
              onClick={() => pick('r', i)}
              animate={stateOf('r', i) === 'wrong' ? { x: [0, -6, 6, -3, 3, 0] } : {}}
              className={cn(
                tileClass(stateOf('r', i)),
                'flex min-h-[64px] w-full items-center px-4 py-2.5 text-[13.5px] leading-snug',
                matched.includes(i) && !locked && 'opacity-50'
              )}
            >
              {text}
            </motion.button>
          ))}
        </div>
      </div>
      {!locked && (
        <p className="mt-3 text-[12px] text-ink-600">
          {matched.length}/{ex.pairs.length} matched{mistakes > 0 ? ` · ${mistakes} miss${mistakes === 1 ? '' : 'es'}` : ''}
        </p>
      )}
    </div>
  )
}

export function BlankEx({ ex, response, setResponse, locked, correct }: ExProps<Of<'blank'>>) {
  const picked = typeof response === 'string' ? response : null
  const slotState: TileState = !picked ? 'idle' : locked ? (correct ? 'correct' : 'wrong') : 'selected'
  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      <p className="mt-5 text-[18px] leading-[2.1] text-gray-100">
        {ex.before}
        <button
          type="button"
          onClick={() => !locked && setResponse(null)}
          className={cn(
            tileClass(slotState),
            'mx-1 inline-flex min-w-[110px] items-center justify-center px-3 py-0.5 align-middle font-mono text-[15px]',
            !picked && 'border-dashed'
          )}
        >
          {picked ?? ' '}
        </button>
        {ex.after}
      </p>
      <div className="mt-6 flex flex-wrap gap-2.5">
        {ex.options.map((opt, i) => {
          const state: TileState = locked
            ? opt.toLowerCase() === ex.answer.toLowerCase()
              ? 'correct'
              : opt === picked
                ? 'wrong'
                : 'dim'
            : opt === picked
              ? 'selected'
              : 'idle'
          return (
            <button
              key={opt}
              type="button"
              disabled={locked}
              onClick={() => setResponse(opt)}
              className={cn(tileClass(state), 'flex items-center gap-2.5 px-3.5 py-2 font-mono text-[14px]')}
            >
              <KeyBadge n={i + 1} state={state} />
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ExplainEx({ ex, response, setResponse, locked }: ExProps<Of<'explain'>>) {
  return (
    <div>
      <Eyebrow>{ex.eyebrow}</Eyebrow>
      <Prompt>{ex.prompt}</Prompt>
      <textarea
        autoFocus
        value={typeof response === 'string' ? response : ''}
        onChange={(e) => setResponse(e.target.value)}
        disabled={locked}
        placeholder="Explain it the way you'd tell a teammate…"
        className="no-drag mt-5 h-40 w-full resize-none rounded-2xl border-2 border-ink-700 bg-ink-900 p-4 text-[15px] leading-relaxed text-gray-100 outline-none transition-colors focus:border-glass-accent/60 disabled:opacity-70"
      />
      <p className="mt-2 text-[12px] text-ink-600">
        Graded on understanding, not wording. {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to check.
      </p>
    </div>
  )
}
