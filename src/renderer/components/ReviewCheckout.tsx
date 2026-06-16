import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ReviewDecision, ReviewDraft } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

const COST_PER_SECTION = 220

const DECISIONS: { id: ReviewDecision; label: string; emoji: string; blurb: string; sel: string }[] = [
  { id: 'approve', label: 'Approve', emoji: '✅', blurb: 'Ship it. You get it.', sel: 'border-glass-add bg-glass-add/15' },
  { id: 'request_changes', label: 'Request changes', emoji: '🛠️', blurb: 'Something needs fixing.', sel: 'border-glass-warm bg-glass-warm/15' },
  { id: 'comment', label: 'Comment', emoji: '💬', blurb: 'Notes, no verdict.', sel: 'border-glass-accent bg-glass-accent/15' }
]

export default function ReviewCheckout({ onClose }: { onClose: () => void }) {
  const diff = useStore((s) => s.diff)
  const overview = useStore((s) => s.overview)
  const walked = useStore((s) => s.walked)
  const coins = useGame((s) => s.coins)
  const spend = useGame((s) => s.spend)
  const unlock = useGame((s) => s.unlock)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const total = overview?.sections.length ?? 0
  const done = overview?.sections.filter((p) => walked.includes(p.id)).length ?? 0
  const allExplored = total > 0 && done === total
  const COST = Math.max(COST_PER_SECTION, COST_PER_SECTION * total)

  const [decision, setDecision] = useState<ReviewDecision>('approve')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [copied, setCopied] = useState(false)

  const cashOut = async () => {
    if (!diff || busy || !allExplored) return
    if (!spend(COST)) return
    setBusy(true)
    try {
      const res = await window.glassbox.generateReview(diff, decision, notes)
      setDraft(res)
      unlock('high_roller')
      pushFx({ kind: 'jackpot' })
      if (sfxOn) play('jackpot')
    } catch (e) {
      setDraft({
        decision,
        summary: `Could not draft: ${(e as Error).message}`,
        positives: [],
        concerns: [],
        body: ''
      })
    }
    setBusy(false)
  }

  const copy = () => {
    if (!draft) return
    navigator.clipboard.writeText(draft.body)
    setCopied(true)
    if (sfxOn) play('coin')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-overlay className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-h-full w-[640px] overflow-y-auto rounded-2xl border border-glass-warm/40 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-white">🎰 Cash out your verdict</h2>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">✕</button>
        </div>
        <p className="mb-4 text-[13px] text-ink-600">
          You earned it — now spend coins to mint your review. Balance: <span className="font-bold text-glass-warm">{coins}🪙</span>
        </p>

        {!draft ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {DECISIONS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setDecision(d.id)
                    if (sfxOn) play('tick')
                  }}
                  className={cn(
                    'no-drag rounded-xl border p-3 text-left transition-all',
                    decision === d.id ? `${d.sel} scale-[1.02]` : 'border-ink-700 hover:border-ink-600'
                  )}
                >
                  <div className="text-[22px]">{d.emoji}</div>
                  <div className="text-[13px] font-semibold text-white">{d.label}</div>
                  <div className="text-[11px] text-ink-600">{d.blurb}</div>
                </button>
              ))}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: your own notes for the review…"
              className="no-drag mb-4 h-20 w-full resize-none rounded-lg border border-ink-700 bg-ink-950 p-3 text-[13px] outline-none focus:border-glass-warm/50"
            />

            <button
              onClick={cashOut}
              disabled={busy || !allExplored || coins < COST}
              className="no-drag flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-glass-warm to-glass-accent2 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {busy ? '🎲 Drafting your review…' : `🎰 Pull the lever — draft review (−${COST}🪙)`}
            </button>
            {!allExplored ? (
              <p className="mt-2 text-center text-[12px] text-glass-warm">
                🔒 Explore all {total} sections first to unlock your verdict ({done}/{total} done).
              </p>
            ) : (
              coins < COST && (
                <p className="mt-2 text-center text-[12px] text-glass-del">
                  Earn {COST - coins} more coins — keep learning to afford your verdict.
                </p>
              )
            )}
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="rounded-xl border border-glass-warm/40 bg-ink-850 p-4">
              <div className="mb-2 text-[20px] font-black text-white">
                {DECISIONS.find((d) => d.id === draft.decision)?.emoji} {DECISIONS.find((d) => d.id === draft.decision)?.label}
              </div>
              <p className="text-[13.5px] leading-relaxed text-gray-200">{draft.summary}</p>
              {draft.positives.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {draft.positives.map((p, i) => (
                    <li key={i} className="text-[13px] text-glass-add">✓ {p}</li>
                  ))}
                </ul>
              )}
              {draft.concerns.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {draft.concerns.map((c, i) => (
                    <li key={i} className="text-[13px] text-glass-warm">→ {c}</li>
                  ))}
                </ul>
              )}
            </div>
            {draft.body && (
              <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-gray-300">{draft.body}</pre>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={copy} className="no-drag flex-1 rounded-lg bg-glass-accent py-2 text-[13px] font-medium text-ink-950 hover:brightness-110">
                {copied ? 'Copied! ✓' : 'Copy review 📋'}
              </button>
              <button onClick={() => setDraft(null)} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] hover:border-ink-600">
                Redraft
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
