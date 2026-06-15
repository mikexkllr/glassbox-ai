import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGame, XP_PER_LEVEL } from '../game/store'

function useTween(value: number) {
  const [display, setDisplay] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    const dur = 500
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(a + (b - a) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return display
}

export default function CoinHud() {
  const coins = useGame((s) => s.coins)
  const xp = useGame((s) => s.xp)
  const combo = useGame((s) => s.combo)
  const sfxOn = useGame((s) => s.sfxOn)
  const toggleSfx = useGame((s) => s.toggleSfx)
  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const pct = Math.round(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)
  const shown = useTween(coins)

  return (
    <div className="no-drag flex items-center gap-2">
      {/* level + xp */}
      <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1">
        <span className="text-[11px] font-bold text-glass-accent">LVL {level}</span>
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-glass-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* coins */}
      <motion.div
        key={coins}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-1.5 rounded-full border border-glass-warm/40 bg-glass-warm/10 px-3 py-1"
      >
        <span className="text-[15px]">🪙</span>
        <span className="font-mono text-[14px] font-bold tabular-nums text-glass-warm">{shown}</span>
      </motion.div>

      {/* live combo */}
      {combo >= 2 && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-1 rounded-full bg-glass-warm px-2 py-1 text-[12px] font-black text-ink-950"
        >
          🔥 {combo}x
        </motion.div>
      )}

      <button
        onClick={toggleSfx}
        title={sfxOn ? 'Mute sounds' : 'Unmute sounds'}
        className="rounded-full border border-ink-700 px-2 py-1 text-[13px] hover:border-ink-600"
      >
        {sfxOn ? '🔊' : '🔇'}
      </button>
    </div>
  )
}
