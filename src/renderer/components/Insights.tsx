import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGame } from '../game/store'
import { cn } from '../lib/files'

const REWARD = 5

/** "Aha" insights, hidden behind a scratch-to-reveal beat for that dopamine hit. */
export default function Insights({ insights, sectionId }: { insights: string[]; sectionId: string }) {
  if (!insights?.length) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-glass-warm">
        <span>💡</span> Insights {' '}
        <span className="text-ink-600">tap to reveal · +{REWARD}🪙 each</span>
      </div>
      {insights.map((text, i) => (
        <InsightCard key={i} text={text} rkey={`insight:${sectionId}:${i}`} />
      ))}
    </div>
  )
}

function InsightCard({ text, rkey }: { text: string; rkey: string }) {
  const rewardOnce = useGame((s) => s.rewardOnce)
  const rewarded = useGame((s) => !!s.rewarded[rkey])
  const [open, setOpen] = useState(rewarded)

  const reveal = (e: React.MouseEvent) => {
    if (open) return
    setOpen(true)
    rewardOnce(rkey, 5, { x: e.clientX, y: e.clientY, reason: 'insight', sound: 'reveal' })
  }

  return (
    <motion.button
      onClick={reveal}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'no-drag block w-full rounded-lg border p-3 text-left text-[13px] leading-relaxed transition-colors',
        open ? 'border-glass-warm/30 bg-glass-warm/5 text-gray-200' : 'border-dashed border-ink-600 bg-ink-900 text-ink-600 hover:border-glass-warm/50'
      )}
    >
      {open ? (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
          <span className="text-glass-warm">✦</span>
          {text}
        </motion.span>
      ) : (
        <span className="flex items-center gap-2">🔒 Tap to reveal insight (+5🪙)</span>
      )}
    </motion.button>
  )
}
