import { useState } from 'react'
import { motion } from 'framer-motion'
import type { SelfCheck as SelfCheckType } from '@shared/types'

/** A skippable "guess what this does first?" beat. Active recall, never scored. */
export default function SelfCheck({ check }: { check: SelfCheckType }) {
  const [phase, setPhase] = useState<'ask' | 'revealed'>('ask')
  const [guess, setGuess] = useState('')

  return (
    <div className="rounded-lg border border-glass-warm/30 bg-glass-warm/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-glass-warm">
        <span>💡</span> Want to guess what this does first?
        <span className="text-[10px] font-normal text-ink-600">(optional — just to make it stick)</span>
      </div>
      <p className="mb-2 text-[13px] text-gray-200">{check.prompt}</p>
      {phase === 'ask' ? (
        <>
          <textarea
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Jot a quick guess (nobody's grading this)…"
            className="no-drag mb-2 h-16 w-full resize-none rounded border border-ink-700 bg-ink-900 p-2 text-[13px] outline-none focus:border-glass-warm/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setPhase('revealed')}
              className="no-drag rounded bg-glass-warm/20 px-3 py-1 text-[12px] text-glass-warm hover:bg-glass-warm/30"
            >
              Reveal
            </button>
            <button onClick={() => setPhase('revealed')} className="no-drag px-3 py-1 text-[12px] text-ink-600 hover:text-white">
              Skip
            </button>
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          {guess.trim() && (
            <div className="mb-2 rounded border border-ink-700 bg-ink-900 p-2 text-[12.5px] text-gray-400">
              <span className="text-ink-600">your guess: </span>
              {guess}
            </div>
          )}
          <p className="text-[13px] leading-relaxed text-gray-200">{check.answer}</p>
        </motion.div>
      )}
    </div>
  )
}
