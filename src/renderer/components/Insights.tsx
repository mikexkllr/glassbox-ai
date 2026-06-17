import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WalkthroughSection } from '@shared/types'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

const REVEAL_REWARD = 5
const JACKPOT_REWARD = 16
const PITY_REWARD = 3

const REEL_POOL = ['🍒', '🔔', '⭐', '💎', '7️⃣', '🪙', '🧠', '💡']
const STOPWORDS = new Set([
  'which', 'where', 'there', 'these', 'those', 'their', 'about', 'would', 'could', 'should', 'because',
  'while', 'after', 'before', 'every', 'value', 'using', 'instead', 'through', 'still', 'first', 'never',
  'always', 'function', 'returns', 'return', 'method', 'thing', 'place', 'means', 'makes', 'gives', 'takes'
])
const GENERIC_DECOYS = ['the cache', 'a fallback', 'the renderer', 'validation', 'the schema', 'the diff', 'a side effect', 'the state']

/** A comprehension challenge baked out of one insight: fill the blanked-out key term. */
interface Challenge {
  blanked: string
  answer: string
  options: string[]
}

/** Find a whole-word occurrence (identifier-aware) of `term` in `text`. */
function wordIndex(text: string, term: string): number {
  const t = text.toLowerCase()
  const m = term.toLowerCase()
  const isW = (c: string) => /[a-z0-9_]/.test(c)
  let from = 0
  while (from <= t.length) {
    const i = t.indexOf(m, from)
    if (i < 0) return -1
    const before = i === 0 ? '' : t[i - 1]
    const after = t[i + m.length] ?? ''
    if (!isW(before) && !isW(after)) return i
    from = i + 1
  }
  return -1
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function longWords(text: string): string[] {
  return (text.match(/[A-Za-z_][A-Za-z0-9_]{4,}/g) ?? [])
    .filter((w) => !STOPWORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length)
}

/**
 * Build the fill-the-blank challenge for an insight.
 * Prefers a real code symbol that appears in the text (grounded distractors);
 * falls back to the most salient word. Returns null if no honest check is possible.
 */
function buildChallenge(text: string, symbols: string[], allInsights: string[], idx: number): Challenge | null {
  let answer = ''
  let at = -1
  for (const sym of symbols) {
    const i = wordIndex(text, sym)
    if (i >= 0 && sym.length > answer.length) {
      answer = sym
      at = i
    }
  }

  let decoys: string[] = []
  if (answer) {
    decoys = shuffle(symbols.filter((s) => s.toLowerCase() !== answer.toLowerCase()))
  } else {
    const words = longWords(text)
    if (!words.length) return null
    answer = words[0]
    at = wordIndex(text, answer)
    const others = allInsights.filter((_, j) => j !== idx).flatMap(longWords)
    decoys = shuffle([...symbols, ...others].filter((s) => s.toLowerCase() !== answer.toLowerCase()))
  }

  // De-dup decoys (case-insensitive), then top up with generics if too few.
  const seen = new Set([answer.toLowerCase()])
  const picked: string[] = []
  for (const d of decoys) {
    if (picked.length >= 2) break
    if (!seen.has(d.toLowerCase())) {
      seen.add(d.toLowerCase())
      picked.push(d)
    }
  }
  for (const g of shuffle(GENERIC_DECOYS)) {
    if (picked.length >= 2) break
    if (!seen.has(g.toLowerCase())) {
      seen.add(g.toLowerCase())
      picked.push(g)
    }
  }
  if (picked.length < 2 || at < 0) return null

  const blanked = text.slice(0, at) + '▮▮▮▮' + text.slice(at + answer.length)
  return { blanked, answer, options: shuffle([answer, ...picked]) }
}

/** "Aha" insights, gamified into a slot machine: reveal, then lock in the jackpot by proving you got it. */
export default function Insights({
  insights,
  explanations,
  sectionId
}: {
  insights: string[]
  explanations: WalkthroughSection['inlineExplanations']
  sectionId: string
}) {
  const symbols = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of explanations ?? []) {
      const s = (e.symbol ?? '').trim()
      if (s.length >= 3 && s.length <= 28 && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase())
        out.push(s)
      }
    }
    return out
  }, [explanations])

  const challenges = useMemo(
    () => insights.map((text, i) => buildChallenge(text, symbols, insights, i)),
    [insights, symbols]
  )

  if (!insights?.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-glass-warm">
        <span>🎰</span> Insight Slots{' '}
        <span className="normal-case tracking-normal text-ink-600">pull the lever · lock in the jackpot 💎</span>
      </div>
      {insights.map((text, i) => (
        <InsightSlot
          key={i}
          text={text}
          challenge={challenges[i]}
          revealKey={`insight:${sectionId}:${i}`}
          lockKey={`insightlock:${sectionId}:${i}`}
        />
      ))}
    </div>
  )
}

type Phase = 'sealed' | 'quiz' | 'won' | 'lost'

function InsightSlot({
  text,
  challenge,
  revealKey,
  lockKey
}: {
  text: string
  challenge: Challenge | null
  revealKey: string
  lockKey: string
}) {
  const rewardOnce = useGame((s) => s.rewardOnce)
  const award = useGame((s) => s.award)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)
  const revealedBefore = useGame((s) => !!s.rewarded[revealKey])
  const wonBefore = useGame((s) => !!s.rewarded[lockKey])

  const initialPhase: Phase = wonBefore ? 'won' : revealedBefore ? (challenge ? 'quiz' : 'won') : 'sealed'
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [reels, setReels] = useState(['💡', '💡', '💡'])
  const [spinning, setSpinning] = useState(false)
  const [wrongPick, setWrongPick] = useState<string | null>(null)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const spinReelsTo = (finals: string[], after?: () => void) => {
    setSpinning(true)
    if (sfxOn) play('whoosh')
    const stopped = [false, false, false]
    ivRef.current = setInterval(() => {
      setReels((d) => d.map((v, i) => (stopped[i] ? finals[i] : REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)])))
    }, 70)
    const stopAt = [420, 620, 820]
    stopAt.forEach((ms, i) => {
      setTimeout(() => {
        stopped[i] = true
        if (sfxOn) play('tick')
        if (i === 2) {
          if (ivRef.current) clearInterval(ivRef.current)
          setReels(finals)
          setSpinning(false)
          after?.()
        }
      }, ms)
    })
  }

  const pull = (e: React.MouseEvent) => {
    if (spinning || phase !== 'sealed') return
    const x = e.clientX
    const y = e.clientY
    spinReelsTo(['💡', '✦', '💡'], () => {
      rewardOnce(revealKey, REVEAL_REWARD, { x, y, reason: 'insight unlocked 💡', sound: 'reveal' })
      setPhase(challenge ? 'quiz' : 'won')
    })
  }

  const choose = (opt: string, e: React.MouseEvent) => {
    if (!challenge || spinning || phase !== 'quiz') return
    if (opt.toLowerCase() === challenge.answer.toLowerCase()) {
      const x = e.clientX
      const y = e.clientY
      spinReelsTo(['💎', '💎', '💎'], () => {
        rewardOnce(lockKey, JACKPOT_REWARD, { x, y, reason: 'JACKPOT — you got it 💎', sound: 'jackpot', confetti: true })
        pushFx({ kind: 'jackpot' })
        setPhase('won')
      })
    } else {
      setWrongPick(opt)
      if (sfxOn) play('wrong')
      spinReelsTo(['🐛', '🐛', '🐛'], () => {
        rewardOnce(`${lockKey}:pity`, PITY_REWARD, { reason: 'so close 🎲', sound: 'tick' })
        pushFx({ kind: 'toast', text: 'Not quite — here’s the answer 🎯', tone: 'bad' })
        setPhase('lost')
      })
    }
  }

  // --- Sealed: a slot machine waiting for the lever ---
  if (phase === 'sealed') {
    return (
      <div className="overflow-hidden rounded-xl border border-dashed border-ink-600 bg-ink-900">
        <ReelStrip reels={reels} spinning={spinning} />
        <motion.button
          onClick={pull}
          whileTap={{ scale: 0.99 }}
          disabled={spinning}
          className="no-drag block w-full px-3 py-2.5 text-center text-[13px] font-bold text-glass-warm transition-colors hover:bg-glass-warm/5 disabled:opacity-60"
        >
          {spinning ? '🎰 spinning…' : `🎰 PULL to reveal insight (+${REVEAL_REWARD}🪙)`}
        </motion.button>
      </div>
    )
  }

  const won = phase === 'won'
  const lost = phase === 'lost'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border',
        won ? 'border-glass-add/40 bg-glass-add/5' : lost ? 'border-glass-del/30 bg-glass-del/5' : 'border-glass-warm/30 bg-glass-warm/5'
      )}
    >
      {(spinning || won || lost) && <ReelStrip reels={reels} spinning={spinning} />}

      <div className="space-y-3 p-3">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 text-[13px] leading-relaxed text-gray-200">
          <span className={won ? 'text-glass-add' : 'text-glass-warm'}>✦</span>
          <span>{text}</span>
        </motion.div>

        {/* Lock-in challenge */}
        <AnimatePresence>
          {phase === 'quiz' && challenge && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2 rounded-lg border border-ink-700 bg-ink-950/60 p-3"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-glass-accent2">
                🔒 Lock in the jackpot — fill the blank
              </div>
              <p className="text-[13px] leading-relaxed text-gray-300">{challenge.blanked}</p>
              <div className="flex flex-wrap gap-2">
                {challenge.options.map((opt) => (
                  <motion.button
                    key={opt}
                    onClick={(e) => choose(opt, e)}
                    disabled={spinning}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      'no-drag rounded-lg border-2 px-3 py-1.5 font-mono text-[12px] font-bold transition-colors',
                      wrongPick === opt
                        ? 'border-glass-del/60 bg-glass-del/10 text-glass-del'
                        : 'border-glass-warm/40 bg-ink-900 text-glass-warm hover:border-glass-warm hover:bg-glass-warm/10'
                    )}
                  >
                    🎰 {opt}
                  </motion.button>
                ))}
              </div>
              <p className="text-[11px] text-ink-600">match the right symbol → +{JACKPOT_REWARD}🪙 + crit chance 💎</p>
            </motion.div>
          )}
        </AnimatePresence>

        {won && challenge && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] font-bold text-glass-add">
            💎 Locked in — you nailed <span className="font-mono">{challenge.answer}</span>. Big brain 🧠
          </motion.div>
        )}
        {won && !challenge && (
          <div className="text-[12px] font-semibold text-glass-add">✓ Insight banked</div>
        )}
        {lost && challenge && (
          <div className="text-[12px] text-gray-300">
            🎯 The answer was <span className="font-mono font-bold text-glass-warm">{challenge.answer}</span>. Now you know.
          </div>
        )}
      </div>
    </div>
  )
}

/** The three-window slot strip, shared by every state. */
function ReelStrip({ reels, spinning }: { reels: string[]; spinning: boolean }) {
  return (
    <div className="flex justify-center gap-2 border-b border-ink-700 bg-ink-950 px-3 py-2">
      {reels.map((r, i) => (
        <motion.div
          key={i}
          animate={spinning ? { y: [0, -4, 0] } : {}}
          transition={{ duration: 0.14, repeat: spinning ? Infinity : 0 }}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-[20px] shadow-inner"
        >
          {r}
        </motion.div>
      ))}
    </div>
  )
}
