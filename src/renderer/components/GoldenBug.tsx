import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../game/store'
import { play } from '../game/sfx'

// A rare golden bug scuttles across the walkthrough — catch it before it
// escapes for a coin bonus. ~1-in-8 spawns are a mega bug worth a jackpot.
const MIN_DELAY_MS = 45_000
const MAX_DELAY_MS = 110_000
const WALK_MS = 9_000
const MEGA_CHANCE = 0.125

interface Bug {
  id: number
  mega: boolean
  fromLeft: boolean
  topPct: number // vertical lane, % of viewport height
}

let bugId = 1

export default function GoldenBug() {
  const [bug, setBug] = useState<Bug | null>(null)
  const caughtRef = useRef(false)

  // Spawn loop: wait a random beat, walk the bug across, repeat forever.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let alive = true
    const schedule = () => {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
      timer = setTimeout(() => {
        if (!alive) return
        caughtRef.current = false
        setBug({
          id: bugId++,
          mega: Math.random() < MEGA_CHANCE,
          fromLeft: Math.random() < 0.5,
          topPct: 20 + Math.random() * 60
        })
        // The bug escapes if nobody catches it before it walks off-screen.
        timer = setTimeout(() => {
          if (!alive) return
          setBug(null)
          schedule()
        }, WALK_MS)
      }, delay)
    }
    schedule()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  const onCatch = (e: React.MouseEvent) => {
    if (!bug || caughtRef.current) return
    caughtRef.current = true
    const g = useGame.getState()
    const base = bug.mega ? 150 : 40 + Math.floor(Math.random() * 31)
    g.award(base, {
      reason: bug.mega ? 'MEGA BUG!! 🐞👑' : 'golden bug! 🐞',
      sound: bug.mega ? 'jackpot' : 'chest',
      confetti: bug.mega,
      x: e.clientX,
      y: e.clientY
    })
    g.recordBugCatch()
    setBug(null)
  }

  const vw = window.innerWidth
  return (
    <AnimatePresence>
      {bug && (
        <motion.button
          key={bug.id}
          onClick={onCatch}
          initial={{ x: bug.fromLeft ? -80 : vw + 80 }}
          animate={{ x: bug.fromLeft ? vw + 80 : -80 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: WALK_MS / 1000, ease: 'linear' }}
          className="no-drag fixed z-[140] cursor-pointer select-none"
          style={{ top: `${bug.topPct}%`, left: 0 }}
          title="Catch it!"
        >
          <motion.span
            animate={{ y: [0, -7, 0, -4, 0], rotate: bug.fromLeft ? [8, -8, 8] : [-8, 8, -8] }}
            transition={{ duration: 0.55, repeat: Infinity }}
            className="block"
            style={{
              fontSize: bug.mega ? 42 : 28,
              filter: bug.mega
                ? 'drop-shadow(0 0 14px #ffd23f) drop-shadow(0 0 4px #ffd23f) saturate(1.6)'
                : 'drop-shadow(0 0 8px #ffd23f) sepia(0.6) saturate(2)',
              transform: bug.fromLeft ? 'scaleX(-1)' : undefined
            }}
          >
            {bug.mega ? '🐞' : '🐛'}
          </motion.span>
          {bug.mega && (
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 text-[14px]"
            >
              👑
            </motion.span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
