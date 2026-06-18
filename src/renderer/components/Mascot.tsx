import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../game/store'
import { play } from '../game/sfx'

interface Mood {
  face: string
  quip: string
  bob?: boolean
}

const IDLE: Mood = { face: '👀', quip: '' }
const SLEEPY: Mood = { face: '😴', quip: 'psst… still reading?', bob: true }

const CLICK_QUIPS = ['keep going! 🔥', 'you got this', 'read every line 👇', 'big brain incoming', 'ship it (after you get it)']

/** A little reactive sidekick that lives in the corner and reacts to the juice:
 * crits, level-ups, combos, and slips. Cheap personality — it just listens to the
 * same fx stream FxLayer renders. */
export default function Mascot() {
  const fx = useGame((s) => s.fx)
  const combo = useGame((s) => s.combo)
  const lastEarnAt = useGame((s) => s.lastEarnAt)
  const sfxOn = useGame((s) => s.sfxOn)

  const [mood, setMood] = useState<Mood>(IDLE)
  const [hidden, setHidden] = useState(false)
  const [now, setNow] = useState(Date.now())
  const seen = useRef(new Set<number>())
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null)

  // React to the newest fx event we haven't seen yet.
  useEffect(() => {
    for (const f of fx) {
      if (seen.current.has(f.id)) continue
      seen.current.add(f.id)
      const m = moodFor(f.kind, combo)
      if (m) {
        setMood(m)
        if (revert.current) clearTimeout(revert.current)
        revert.current = setTimeout(() => setMood(IDLE), 2600)
      }
    }
    if (seen.current.size > 200) seen.current = new Set(fx.map((f) => f.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx])

  // Tick so the idle/sleepy state can kick in without new events.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  if (hidden) return null

  const idleMs = lastEarnAt ? now - lastEarnAt : 0
  const shown = mood.quip ? mood : idleMs > 25_000 ? SLEEPY : IDLE

  const tap = () => {
    if (sfxOn) play('tick')
    setMood({ face: '🤩', quip: CLICK_QUIPS[Math.floor(Math.random() * CLICK_QUIPS.length)] })
    if (revert.current) clearTimeout(revert.current)
    revert.current = setTimeout(() => setMood(IDLE), 2600)
  }

  return (
    <div className="fixed bottom-3 left-3 z-[120] flex items-end gap-2 select-none">
      <motion.button
        onClick={tap}
        whileTap={{ scale: 0.9 }}
        animate={shown.bob ? { y: [0, -4, 0] } : { y: 0 }}
        transition={shown.bob ? { duration: 2, repeat: Infinity } : { duration: 0.2 }}
        title="your code buddy"
        className="no-drag flex h-12 w-12 items-center justify-center rounded-full border border-ink-700 bg-ink-850/90 text-[26px] shadow-lg backdrop-blur hover:border-glass-accent/60"
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={shown.face}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {shown.face}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {shown.quip && (
          <motion.div
            initial={{ opacity: 0, x: -8, y: 4 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="mb-1 max-w-[180px] rounded-2xl rounded-bl-sm border border-ink-700 bg-ink-850/95 px-3 py-1.5 text-[12px] font-medium text-gray-100 shadow-lg"
          >
            {shown.quip}
            <button
              onClick={() => setHidden(true)}
              title="hide buddy"
              className="no-drag ml-2 text-[10px] text-ink-600 hover:text-white"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function moodFor(kind: string, combo: number): Mood | null {
  switch (kind) {
    case 'crit':
    case 'jackpot':
      return { face: '🤩', quip: pick(["LET'S GOOO", 'CRACKED IT', 'insane!']) }
    case 'levelup':
      return { face: '🥳', quip: pick(['level up!', 'big brain energy']) }
    case 'hype':
      return { face: '🔥', quip: pick(['unstoppable', 'cooking 🔥']) }
    case 'combo':
      return combo >= 3 ? { face: '😎', quip: `${combo}× combo!` } : null
    case 'toast':
      return { face: '😬', quip: pick(['oof', 'careful now']) }
    default:
      return null
  }
}

function pick(a: string[]): string {
  return a[Math.floor(Math.random() * a.length)]
}
