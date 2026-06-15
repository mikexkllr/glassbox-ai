import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import type { TrailEntry } from '@shared/types'
import TrailChip from './InvestigationTrail'

/** Inline "wait, why this?" — a grounded answer about a specific bit of the change. */
export default function WhyThis({ context }: { context: string }) {
  const diff = useStore((s) => s.diff)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [trail, setTrail] = useState<TrailEntry[]>([])

  const ask = async () => {
    if (!diff || !q.trim()) return
    setBusy(true)
    setAnswer(null)
    try {
      const res = await window.glassbox.askWhy(diff, q, context)
      setAnswer(res.answer)
      setTrail(res.trail)
    } catch (e) {
      setAnswer(`Sorry — ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="no-drag text-[11.5px] text-glass-accent hover:underline"
      >
        wait, why this?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/60 p-2">
              <div className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && ask()}
                  placeholder="Ask anything about this part…"
                  className="no-drag flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[13px] outline-none focus:border-glass-accent/50"
                />
                <button
                  onClick={ask}
                  disabled={busy}
                  className="no-drag rounded bg-glass-accent/20 px-3 py-1 text-[12px] text-glass-accent hover:bg-glass-accent/30 disabled:opacity-50"
                >
                  {busy ? '…' : 'Ask'}
                </button>
              </div>
              {answer && (
                <div className="mt-2">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-200">{answer}</p>
                  {trail.length > 0 && <TrailChip trail={trail} />}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
