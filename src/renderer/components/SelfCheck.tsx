import { useState } from 'react'
import { motion } from 'framer-motion'
import type { SelfCheck as SelfCheckType, ScoreResult } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

/**
 * Active-recall beat. The user can guess, get AI-scored with good/bad hints,
 * and earn bonus coins for genuinely good answers.
 */
export default function SelfCheck({ check, sectionId }: { check: SelfCheckType; sectionId: string }) {
  const diff = useStore((s) => s.diff)
  const saved = useStore((s) => s.selfCheckResults[sectionId])
  const setSelfCheckResult = useStore((s) => s.setSelfCheckResult)
  const award = useGame((s) => s.award)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)
  const sfxOn = useGame((s) => s.sfxOn)

  // Restore from store so answers persist across section navigation.
  const [phase, setPhase] = useState<'ask' | 'revealed'>(saved ? 'revealed' : 'ask')
  const [guess, setGuess] = useState(saved?.guess ?? '')
  const [scoring, setScoring] = useState(false)
  const [score, setScore] = useState<ScoreResult | null>(saved?.score ?? null)

  const submitGuess = async (e: React.MouseEvent) => {
    if (!diff || !guess.trim()) return
    setScoring(true)
    if (sfxOn) play('whoosh')
    let res: ScoreResult
    try {
      res = await window.glassbox.scoreAnswer(diff, check.prompt, check.answer, guess)
      // Base for engaging + bonus scaled by how good the answer was.
      const base = rewardOnce(`selfcheck:${sectionId}`, 10, { reason: 'good interaction' })
      const bonus = Math.round(res.score / 4) // up to +25
      if (bonus > 0) award(bonus, { x: e.clientX, y: e.clientY, reason: `${res.score}/100`, sound: 'coin', confetti: res.score >= 90 })
      if (res.score >= 90) unlock('big_brain')
      void base
    } catch {
      res = { score: 50, verdict: 'Nice try!', good: 'You engaged with it.', missing: 'Could not reach the model.' }
    }
    setScore(res)
    setSelfCheckResult(sectionId, { guess, score: res })
    setScoring(false)
    setPhase('revealed')
  }

  return (
    <div className="rounded-lg border border-glass-warm/30 bg-glass-warm/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-glass-warm">
        <span>💡</span> Guess first — earn up to <span className="font-bold">+35🪙</span>
        <span className="text-[10px] font-normal text-ink-600">(active recall, never graded harshly)</span>
      </div>
      <p className="mb-2 text-[13px] text-gray-200">{check.prompt}</p>

      {phase === 'ask' ? (
        <>
          <textarea
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type your best guess — the AI will reward real understanding…"
            className="no-drag mb-2 h-16 w-full resize-none rounded border border-ink-700 bg-ink-900 p-2 text-[13px] outline-none focus:border-glass-warm/50"
          />
          <div className="flex gap-2">
            <button
              onClick={submitGuess}
              disabled={scoring || !guess.trim()}
              className="no-drag rounded bg-glass-warm/20 px-3 py-1 text-[12px] font-medium text-glass-warm hover:bg-glass-warm/30 disabled:opacity-50"
            >
              {scoring ? 'Scoring…' : 'Submit answer 🎯'}
            </button>
            <button onClick={() => setPhase('revealed')} className="no-drag px-3 py-1 text-[12px] text-ink-600 hover:text-white">
              Just show me
            </button>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {score && (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <div className="mb-1 flex items-center gap-2">
                <ScoreBadge score={score.score} />
                <span className="text-[13px] font-medium text-white">{score.verdict}</span>
              </div>
              <div className="text-[12.5px] leading-relaxed">
                <p className="text-glass-add">✓ {score.good}</p>
                {score.missing && <p className="mt-0.5 text-glass-warm">→ {score.missing}</p>}
              </div>
            </div>
          )}
          <div className="rounded-lg bg-glass-add/10 p-2.5 text-[13px] leading-relaxed text-gray-200">
            <span className="text-[11px] uppercase tracking-wide text-ink-600">The answer: </span>
            {check.answer}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'bg-glass-add text-ink-950' : score >= 50 ? 'bg-glass-warm text-ink-950' : 'bg-ink-700 text-white'
  return <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-black', tone)}>{score}/100</span>
}
