import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QuizQuestion } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PER_Q_MS = 12_000
const MAX_LIVES = 3

/** The capstone: a timed rapid-fire recall gauntlet against "The Bug", built from
 * every loaded section's quiz. Correct answers damage the boss; wrong answers (or
 * the timer running out) cost a life. Beat it, then ship your verdict. */
export default function BossFight({ onClose, onCashout }: { onClose: () => void; onCashout: () => void }) {
  const sectionsMap = useStore((s) => s.sections)
  const award = useGame((s) => s.award)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const breakCombo = useGame((s) => s.breakCombo)
  const unlock = useGame((s) => s.unlock)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const pool = useMemo(
    () => shuffle(Object.values(sectionsMap).flatMap((s) => s.quiz ?? [])),
    [sectionsMap]
  )

  const hpMax = Math.max(5, Math.min(8, pool.length))
  const [phase, setPhase] = useState<'intro' | 'fight' | 'win' | 'lose'>('intro')
  const [idx, setIdx] = useState(0)
  const [hp, setHp] = useState(hpMax)
  const [lives, setLives] = useState(MAX_LIVES)
  const [picked, setPicked] = useState<number | null>(null)
  const [hit, setHit] = useState(false)
  const [timeLeft, setTimeLeft] = useState(PER_Q_MS)
  const deadline = useRef(0)
  const payout = useRef(0)

  const q: QuizQuestion | undefined = pool.length ? pool[idx % pool.length] : undefined

  // Per-question countdown. A timeout counts as a missed swing.
  useEffect(() => {
    if (phase !== 'fight' || picked !== null) return
    deadline.current = Date.now() + PER_Q_MS
    setTimeLeft(PER_Q_MS)
    const t = setInterval(() => {
      const left = deadline.current - Date.now()
      setTimeLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(t)
        answer(-1)
      }
    }, 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, picked])

  const next = (dmgHp: number, dmgLives: number) => {
    const nh = hp - dmgHp
    const nl = lives - dmgLives
    setHp(nh)
    setLives(nl)
    setTimeout(() => {
      if (nh <= 0) {
        const got = rewardOnce('boss:victory', 120, { reason: 'BOSS SLAIN ⚔️', sound: 'jackpot', confetti: true })
        payout.current = got
        pushFx({ kind: 'jackpot' })
        unlock('boss_slain')
        setPhase('win')
      } else if (nl <= 0) {
        breakCombo()
        setPhase('lose')
      } else {
        setPicked(null)
        setIdx((i) => i + 1)
      }
    }, 850)
  }

  const answer = (choice: number) => {
    if (picked !== null || !q) return
    setPicked(choice)
    if (choice === q.correctIndex) {
      if (sfxOn) play('correct')
      award(8, { reason: 'hit!', sound: 'crit' })
      next(1, 0)
    } else {
      if (sfxOn) play('wrong')
      setHit(true)
      setTimeout(() => setHit(false), 400)
      breakCombo()
      next(0, 1)
    }
  }

  if (pool.length < 3)
    return (
      <Shell onClose={onClose}>
        <div className="py-10 text-center text-[13px] text-ink-600">
          The Bug is still asleep. Open a few sections (and their quizzes) first, then come back to fight. ⚔️
        </div>
      </Shell>
    )

  return (
    <Shell onClose={onClose}>
      {phase === 'intro' && (
        <div className="py-6 text-center">
          <motion.div
            animate={{ y: [0, -8, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            className="text-[72px]"
          >
            👾
          </motion.div>
          <h3 className="mt-2 text-[22px] font-black text-white">The Bug awaits</h3>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-ink-600">
            Rapid-fire questions from everything you've read. Right answers wound it; wrong answers — or the
            timer — cost a life. You have {MAX_LIVES} lives and {PER_Q_MS / 1000}s per question.
          </p>
          <button
            onClick={() => setPhase('fight')}
            className="no-drag mt-5 rounded-xl bg-gradient-to-r from-glass-del to-glass-warm px-7 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.03]"
          >
            ⚔️ Enter the fight
          </button>
        </div>
      )}

      {phase === 'fight' && q && (
        <div>
          {/* boss + bars */}
          <div className="mb-4 flex items-center gap-4">
            <motion.div animate={hit ? { x: [0, -8, 8, -4, 0], filter: ['brightness(2)', 'brightness(1)'] } : {}} className="text-[48px]">
              👾
            </motion.div>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
                <span className="text-glass-del">The Bug</span>
                <span className="text-ink-600">
                  {Math.max(0, hp)}/{hpMax} HP
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border border-ink-700 bg-ink-950">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-glass-del to-glass-warm"
                  animate={{ width: `${(Math.max(0, hp) / hpMax) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                />
              </div>
              <div className="mt-1.5 flex gap-1">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <span key={i} className={cn('text-[14px]', i < lives ? '' : 'opacity-25 grayscale')}>
                    ❤️
                  </span>
                ))}
                <span className="ml-auto font-mono text-[11px] text-ink-600">Q{idx + 1}</span>
              </div>
            </div>
          </div>

          {/* timer */}
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className={cn('h-full rounded-full', timeLeft < 4000 ? 'bg-glass-del' : 'bg-glass-accent2')}
              style={{ width: `${(timeLeft / PER_Q_MS) * 100}%` }}
            />
          </div>

          {/* question */}
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              <p className="mb-3 text-[14px] font-medium text-gray-100">{q.question}</p>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const isPicked = picked === i
                  const isAnswer = picked !== null && i === q.correctIndex
                  return (
                    <button
                      key={i}
                      onClick={() => answer(i)}
                      disabled={picked !== null}
                      className={cn(
                        'no-drag block w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                        isAnswer
                          ? 'border-glass-add bg-glass-add/15 text-white'
                          : isPicked
                            ? 'border-glass-del bg-glass-del/15 text-white'
                            : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent/50'
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
              {picked !== null && q.explanation && (
                <p className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-2.5 text-[12px] text-ink-400">
                  {q.explanation}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {phase === 'win' && (
        <div className="py-6 text-center">
          <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="text-[72px]">
            ⚔️
          </motion.div>
          <h3 className="mt-1 text-[24px] font-black text-glass-warm">BOSS SLAIN!</h3>
          <p className="mt-1 text-[13px] text-gray-300">
            You proved you actually read it. +{payout.current}🪙 bounty.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={onCashout}
              className="no-drag rounded-xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-6 py-2.5 text-[14px] font-black text-ink-950 hover:scale-[1.02]"
            >
              🎰 Cash out your verdict
            </button>
            <button onClick={onClose} className="no-drag rounded-xl border border-ink-700 px-5 py-2.5 text-[13px] hover:border-ink-600">
              Close
            </button>
          </div>
        </div>
      )}

      {phase === 'lose' && (
        <div className="py-6 text-center">
          <div className="text-[72px]">💀</div>
          <h3 className="mt-1 text-[22px] font-black text-glass-del">The bug survived…</h3>
          <p className="mt-1 text-[13px] text-ink-600">Go re-read the tricky sections and try again.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => {
                setHp(hpMax)
                setLives(MAX_LIVES)
                setIdx((i) => i + 1)
                setPicked(null)
                setPhase('fight')
              }}
              className="no-drag rounded-xl bg-glass-accent px-6 py-2.5 text-[14px] font-bold text-ink-950 hover:brightness-110"
            >
              ⚔️ Rematch
            </button>
            <button onClick={onClose} className="no-drag rounded-xl border border-ink-700 px-5 py-2.5 text-[13px] hover:border-ink-600">
              Retreat
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-overlay className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-[560px] max-w-full overflow-hidden rounded-2xl border border-glass-del/40 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">⚔️ Boss Fight</h2>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  )
}
