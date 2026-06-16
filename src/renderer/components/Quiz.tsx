import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QuizQuestion } from '@shared/types'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

const REWARD_FIRST_TRY = 25
const REWARD_RETRY = 8

/** A Brilliant-style multiple-choice question. Correct answers pay out coins. */
export default function Quiz({ q, sectionId, index }: { q: QuizQuestion; sectionId: string; index: number }) {
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const unlock = useGame((s) => s.unlock)
  const mark = useGame((s) => s.mark)
  const sfxOn = useGame((s) => s.sfxOn)

  const [picked, setPicked] = useState<number | null>(null)
  const [attempts, setAttempts] = useState(0)
  const solved = picked === q.correctIndex

  const choose = (i: number, e: React.MouseEvent) => {
    if (solved) return
    setPicked(i)
    if (i === q.correctIndex) {
      const first = attempts === 0
      award(first ? REWARD_FIRST_TRY : REWARD_RETRY, {
        x: e.clientX,
        y: e.clientY,
        reason: first ? 'W · no cap 💯' : 'gng got it',
        sound: 'correct',
        confetti: first
      })
      mark(`quizsolved:${sectionId}:${q.id}`)
      if (first) unlock('quiz_ace')
    } else {
      setAttempts((a) => a + 1)
      breakCombo()
      if (sfxOn) play('wrong')
    }
  }

  return (
    <div className="rounded-xl border border-glass-accent/30 bg-ink-900/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-glass-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-glass-accent">
          Quiz {index + 1}
        </span>
        <span className="text-[11px] text-ink-600">+{REWARD_FIRST_TRY}🪙 first try</span>
      </div>
      <p className="mb-3 text-[14px] font-medium text-gray-100">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isPicked = picked === i
          const isCorrect = i === q.correctIndex
          const reveal = picked !== null
          const state =
            reveal && isCorrect
              ? 'correct'
              : isPicked && !isCorrect
                ? 'wrong'
                : 'idle'
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
                    : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent/50'
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
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'mt-3 rounded-lg p-3 text-[13px] leading-relaxed',
                solved ? 'bg-glass-add/10 text-gray-200' : 'bg-glass-warm/10 text-gray-200'
              )}
            >
              <span className="font-bold">{solved ? '🎉 Correct! ' : '🤔 Not quite. '}</span>
              {q.explanation}
              {!solved && <div className="mt-1 text-[12px] text-glass-warm">Try again — pick another answer.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
