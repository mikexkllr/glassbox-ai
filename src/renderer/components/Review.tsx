import { useMemo, useState } from 'react'
import type { QuizQuestion } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

interface Card {
  key: string
  sectionTitle: string
  q: QuizQuestion
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function fromNow(ts: number): string {
  const ms = ts - Date.now()
  if (ms <= 0) return 'now'
  const h = ms / 3_600_000
  if (h < 1) return 'in under an hour'
  if (h < 24) return `in ${Math.round(h)}h`
  return `in ${Math.round(h / 24)}d`
}

/** Spaced-repetition review: re-tests quizzes you've already aced so the
 * understanding sticks. Cards reschedule with an SM-2-lite curve; come back
 * daily and the due ones resurface. */
export default function Review() {
  const sectionsMap = useStore((s) => s.sections)
  const overview = useStore((s) => s.overview)
  const rewarded = useGame((s) => s.rewarded)
  const srs = useGame((s) => s.srs)
  const reviewCard = useGame((s) => s.reviewCard)
  const award = useGame((s) => s.award)
  const sfxOn = useGame((s) => s.sfxOn)

  const allCards = useMemo<Card[]>(() => {
    const title = (id: string) => overview?.sections.find((p) => p.id === id)?.title ?? 'Section'
    const out: Card[] = []
    for (const sec of Object.values(sectionsMap)) {
      for (const q of sec.quiz ?? []) {
        const key = `${sec.id}:${q.id}`
        if (rewarded[`quizsolved:${key}`]) out.push({ key, sectionTitle: title(sec.id), q })
      }
    }
    return out
  }, [sectionsMap, rewarded, overview])

  const due = useMemo(
    () => allCards.filter((c) => !srs[c.key] || srs[c.key].due <= Date.now()),
    [allCards, srs]
  )

  const [run, setRun] = useState<Card[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [right, setRight] = useState(0)

  const order = useMemo(() => {
    const c = run?.[idx]
    return c ? shuffle(c.q.options.map((_, i) => i)) : []
  }, [run, idx])

  if (allCards.length === 0)
    return <Empty text="No review cards yet 🧠 — ace some quizzes and they'll land here so you can lock them in long-term." />

  // Finished a run.
  if (run && idx >= run.length)
    return (
      <div className="py-8 text-center">
        <div className="text-[44px]">🧠</div>
        <div className="mt-1 text-[18px] font-black text-glass-accent2">Review complete</div>
        <div className="mt-1 text-[13px] text-gray-300">
          {right}/{run.length} correct · rescheduled for later
        </div>
        <button
          onClick={() => { setRun(null); setIdx(0); setPicked(null); setRight(0) }}
          className="no-drag mt-5 rounded-lg border border-ink-700 px-5 py-2 text-[13px] hover:border-ink-600"
        >
          Back to deck
        </button>
      </div>
    )

  // Intro / due summary.
  if (!run) {
    if (due.length === 0) {
      const soonest = Math.min(...allCards.map((c) => srs[c.key]?.due ?? Date.now()))
      return <Empty text={`All caught up 🎉 — ${allCards.length} card${allCards.length === 1 ? '' : 's'} in your deck. Next review ${fromNow(soonest)}.`} />
    }
    return (
      <div className="py-6 text-center">
        <div className="text-[48px]">🔁</div>
        <div className="mt-1 text-[28px] font-black text-glass-accent2">{due.length} due</div>
        <div className="mb-5 text-[12px] text-ink-600">
          {allCards.length} card{allCards.length === 1 ? '' : 's'} in your deck · spaced repetition makes it stick
        </div>
        <button
          onClick={() => { setRun(shuffle(due)); setIdx(0); setPicked(null); setRight(0) }}
          className="no-drag rounded-xl bg-gradient-to-r from-glass-accent2 to-glass-accent px-6 py-3 text-[14px] font-black text-ink-950 transition-transform hover:scale-[1.02]"
        >
          Start review →
        </button>
      </div>
    )
  }

  const card = run[idx]
  const q = card.q

  const choose = (oi: number) => {
    if (picked !== null) return
    setPicked(oi)
    const correct = order[oi] === q.correctIndex
    if (correct) {
      setRight((r) => r + 1)
      award(5, { reason: 'recall 🧠', sound: 'correct' })
    } else if (sfxOn) play('wrong')
    reviewCard(card.key, correct)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[11px] text-ink-600">
        <span>Card {idx + 1}/{run.length}</span>
        <span className="ml-2 truncate">{card.sectionTitle}</span>
      </div>
      <p className="mb-3 text-[14px] font-medium text-gray-100">{q.question}</p>
      <div className="space-y-2">
        {order.map((optIndex, oi) => {
          const reveal = picked !== null
          const isCorrect = optIndex === q.correctIndex
          const isPicked = picked === oi
          return (
            <button
              key={oi}
              disabled={reveal}
              onClick={() => choose(oi)}
              className={cn(
                'no-drag block w-full rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors',
                reveal && isCorrect
                  ? 'border-glass-add bg-glass-add/15 text-white'
                  : isPicked
                    ? 'border-glass-del bg-glass-del/15 text-white'
                    : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent/50'
              )}
            >
              {q.options[optIndex]}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3 text-[12.5px] leading-relaxed text-gray-300">
          {q.explanation}
          <div className="mt-3 text-right">
            <button
              onClick={() => { setPicked(null); setIdx((i) => i + 1) }}
              className="no-drag rounded-lg bg-glass-accent px-4 py-1.5 text-[12.5px] font-semibold text-ink-950 hover:brightness-110"
            >
              {idx + 1 >= run.length ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-[13px] leading-relaxed text-ink-600">{text}</div>
}
