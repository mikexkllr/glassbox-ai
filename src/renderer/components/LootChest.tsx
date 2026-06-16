import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

/**
 * Section-mastery loot chest. Reveal every insight, ace every quiz, and answer
 * the self-check to unlock it — then tap for a random jackpot (variable reward).
 */
export default function LootChest({
  sectionId,
  insightCount,
  quizIds,
  hasSelfCheck
}: {
  sectionId: string
  insightCount: number
  quizIds: string[]
  hasSelfCheck: boolean
}) {
  const rewarded = useGame((s) => s.rewarded)
  const award = useGame((s) => s.award)
  const mark = useGame((s) => s.mark)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const [got, setGot] = useState<number | null>(null)
  const [shaking, setShaking] = useState(false)

  const total = insightCount + quizIds.length + (hasSelfCheck ? 1 : 0)
  if (total === 0) return null

  const doneInsights = Array.from({ length: insightCount }).filter((_, i) => rewarded[`insight:${sectionId}:${i}`]).length
  const doneQuiz = quizIds.filter((id) => rewarded[`quizsolved:${sectionId}:${id}`]).length
  const doneSelf = hasSelfCheck && rewarded[`selfcheck:${sectionId}`] ? 1 : 0
  const done = doneInsights + doneQuiz + doneSelf
  const pct = Math.round((done / total) * 100)
  const unlocked = done >= total
  const claimed = !!rewarded[`chest:${sectionId}`]

  const open = (e: React.MouseEvent) => {
    if (!unlocked || claimed || got !== null) return
    setShaking(true)
    if (sfxOn) play('chest')
    setTimeout(() => {
      const base = 50 + Math.floor(Math.random() * 41) // 50-90, before combo/crit
      const total = award(base, { x: e.clientX, y: e.clientY, reason: 'CHEST!', sound: 'chest', confetti: true })
      mark(`chest:${sectionId}`)
      pushFx({ kind: 'jackpot' })
      setGot(total)
      setShaking(false)
    }, 550)
  }

  const alreadyOpen = claimed && got === null

  return (
    <div
      className={cn(
        'rounded-xl border p-4 text-center transition-colors',
        unlocked && !claimed
          ? 'border-glass-warm bg-gradient-to-b from-glass-warm/15 to-transparent'
          : 'border-ink-700 bg-ink-900/50'
      )}
    >
      <motion.button
        onClick={open}
        disabled={!unlocked || claimed}
        animate={
          shaking
            ? { rotate: [0, -10, 10, -8, 8, 0], scale: [1, 1.1, 1.1, 1.15, 1] }
            : unlocked && !claimed
              ? { y: [0, -4, 0] }
              : {}
        }
        transition={shaking ? { duration: 0.5 } : { duration: 1.4, repeat: Infinity }}
        className="no-drag text-[44px] disabled:cursor-default"
        style={{ filter: unlocked || claimed ? 'none' : 'grayscale(1) opacity(0.5)' }}
      >
        {got !== null || alreadyOpen ? '🧰' : unlocked ? '🎁' : '🔒'}
      </motion.button>

      {got !== null ? (
        <div className="text-[14px] font-black text-glass-warm">JACKPOT! +{got}🪙</div>
      ) : alreadyOpen ? (
        <div className="text-[13px] text-ink-600">Chest opened ✓</div>
      ) : unlocked ? (
        <div className="text-[14px] font-bold text-glass-warm">Mastery chest unlocked — TAP TO OPEN!</div>
      ) : (
        <>
          <div className="text-[13px] font-medium text-gray-300">Mastery chest</div>
          <div className="mx-auto mt-2 flex max-w-xs items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-glass-warm transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-ink-600">
              {done}/{total}
            </span>
          </div>
          <div className="mt-1 text-[10.5px] text-ink-600">
            reveal insights · ace quizzes{hasSelfCheck ? ' · answer the self-check' : ''} to unlock
          </div>
        </>
      )}
    </div>
  )
}
