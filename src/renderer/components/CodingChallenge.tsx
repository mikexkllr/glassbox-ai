import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { CodingChallenge as ChallengeType, ScoreResult } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

const HINT_COST = 8 // each hint taken shaves this off the score bonus
const MAX_BONUS = 50 // score-scaled bonus on top of the participation base

const DIFF_META: Record<ChallengeType['difficulty'], { label: string; cls: string }> = {
  easy: { label: 'EASY', cls: 'bg-glass-add/15 text-glass-add' },
  medium: { label: 'MEDIUM', cls: 'bg-glass-warm/15 text-glass-warm' },
  hard: { label: 'HARD', cls: 'bg-glass-del/15 text-glass-del' }
}

/**
 * The chapter's coding mini-game: complete a starter snippet built from the
 * section's code, take hints if you must (they eat the reward), and get your
 * attempt AI-scored against the reference solution for coins.
 */
export default function CodingChallenge({ challenge, sectionId }: { challenge: ChallengeType; sectionId: string }) {
  const diff = useStore((s) => s.diff)
  const saved = useStore((s) => s.challengeResults[sectionId])
  const setChallengeResult = useStore((s) => s.setChallengeResult)
  const award = useGame((s) => s.award)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)

  const [phase, setPhase] = useState<'solve' | 'done'>(saved ? 'done' : 'solve')
  const [code, setCode] = useState(saved?.code ?? challenge.starterCode)
  const [hintsUsed, setHintsUsed] = useState(saved?.hintsUsed ?? 0)
  const [scoring, setScoring] = useState(false)
  const [score, setScore] = useState<ScoreResult | null>(saved?.score ?? null)
  const [showSolution, setShowSolution] = useState(!!saved)

  const meta = DIFF_META[challenge.difficulty] ?? DIFF_META.medium

  const takeHint = () => {
    if (hintsUsed >= challenge.hints.length) return
    setHintsUsed((h) => h + 1)
    if (sfxOn) play('reveal')
  }

  // Tab inserts two spaces instead of leaving the editor.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: end } = el
    setCode(code.slice(0, s) + '  ' + code.slice(end))
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
  }

  const submit = async (e: React.MouseEvent) => {
    if (!diff || !code.trim() || code.trim() === challenge.starterCode.trim()) return
    setScoring(true)
    if (sfxOn) play('whoosh')
    let res: ScoreResult
    try {
      const question = `Coding challenge: ${challenge.brief}\n\nStarter code (${challenge.language}):\n${challenge.starterCode}\n\nJudge whether the learner's completed code correctly fills the gap. Correct logic matters; style and naming do not. Equivalent alternative implementations deserve full marks.`
      res = await window.glassbox.scoreAnswer(diff, question, challenge.referenceSolution, code)
      // Only the FIRST submission for this section pays out — otherwise a retry
      // could re-earn the score-scaled bonus indefinitely on already-correct code.
      const firstAttempt = !useGame.getState().rewarded[`challenge:${sectionId}`]
      rewardOnce(`challenge:${sectionId}`, 12, { reason: 'took the challenge ⚒️' })
      if (firstAttempt) {
        const bonus = Math.max(0, Math.round((res.score / 100) * MAX_BONUS) - hintsUsed * HINT_COST)
        if (bonus > 0)
          award(bonus, { x: e.clientX, y: e.clientY, reason: `${res.score}/100 forged!`, sound: 'jackpot', confetti: res.score >= 80 })
        if (res.score >= 70) unlock('code_smith')
        if (res.score >= 90 && hintsUsed === 0) unlock('no_hints')
      }
      if (res.score < 40) breakCombo()
    } catch {
      res = { score: 50, verdict: 'Nice attempt!', good: 'You gave it a real shot.', missing: 'Could not reach the model to score it.' }
    }
    setScore(res)
    setChallengeResult(sectionId, { code, score: res, hintsUsed })
    setScoring(false)
    setPhase('done')
    setShowSolution(true)
  }

  const giveUp = () => {
    setShowSolution(true)
    setPhase('done')
    if (sfxOn) play('reveal')
  }

  const retry = () => {
    setPhase('solve')
    setShowSolution(false)
    setScore(null)
  }

  return (
    <div className="rounded-xl border border-glass-accent2/30 bg-glass-accent2/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[16px]">⚒️</span>
        <span className="text-[13px] font-semibold text-white">Coding Challenge: {challenge.title}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider', meta.cls)}>{meta.label}</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-600">{challenge.language}</span>
      </div>
      <p className="mb-1 text-[13px] leading-relaxed text-gray-200">{challenge.brief}</p>
      <p className="mb-2 text-[11px] text-ink-600">
        Fill the gap for up to <span className="font-bold text-glass-warm">+{12 + MAX_BONUS}🪙</span> — each hint costs {HINT_COST}🪙 of the bonus.
      </p>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKeyDown}
        readOnly={phase === 'done'}
        spellCheck={false}
        rows={Math.min(18, Math.max(6, code.split('\n').length + 1))}
        className={cn(
          'no-drag mb-2 w-full resize-y rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[12.5px] leading-relaxed text-gray-200 outline-none focus:border-glass-accent2/50',
          phase === 'done' && 'opacity-80'
        )}
      />

      {/* hints */}
      {hintsUsed > 0 && (
        <div className="mb-2 space-y-1.5">
          {challenge.hints.slice(0, hintsUsed).map((h, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-glass-warm/30 bg-glass-warm/5 px-2.5 py-1.5 text-[12.5px] text-gray-200">
              <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wide text-glass-warm">Hint {i + 1}:</span>
              {h}
            </motion.div>
          ))}
        </div>
      )}

      {phase === 'solve' ? (
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={scoring || !code.trim() || code.trim() === challenge.starterCode.trim()}
            className="no-drag rounded-lg bg-glass-accent2 px-4 py-1.5 text-[12.5px] font-semibold text-ink-950 hover:brightness-110 disabled:opacity-50"
          >
            {scoring ? 'Forging verdict…' : 'Submit code ⚒️'}
          </button>
          {hintsUsed < challenge.hints.length && (
            <button
              onClick={takeHint}
              disabled={scoring}
              className="no-drag rounded-lg border border-glass-warm/40 px-3 py-1.5 text-[12px] text-glass-warm hover:bg-glass-warm/10"
            >
              💡 Hint {hintsUsed + 1}/{challenge.hints.length} (−{HINT_COST}🪙)
            </button>
          )}
          <button onClick={giveUp} disabled={scoring} className="no-drag ml-auto px-2 py-1.5 text-[12px] text-ink-600 hover:text-white">
            show solution (no coins)
          </button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {score && (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <div className="mb-1 flex items-center gap-2">
                <ScoreBadge score={score.score} />
                <span className="text-[13px] font-medium text-white">{score.verdict}</span>
                {hintsUsed > 0 && <span className="ml-auto text-[10.5px] text-ink-600">{hintsUsed} hint{hintsUsed > 1 ? 's' : ''} used</span>}
              </div>
              <div className="text-[12.5px] leading-relaxed">
                <p className="text-glass-add">✓ {score.good}</p>
                {score.missing && <p className="mt-0.5 text-glass-warm">→ {score.missing}</p>}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {showSolution && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                <div className="rounded-lg bg-glass-add/10 p-2.5">
                  <span className="text-[11px] uppercase tracking-wide text-ink-600">Reference solution</span>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-gray-200">
                    {challenge.referenceSolution}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={retry} className="no-drag px-1 py-1 text-[12px] text-ink-600 hover:text-white">
            ↺ try again (coins already banked)
          </button>
        </motion.div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'bg-glass-add text-ink-950' : score >= 50 ? 'bg-glass-warm text-ink-950' : 'bg-ink-700 text-white'
  return <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-black', tone)}>{score}/100</span>
}
