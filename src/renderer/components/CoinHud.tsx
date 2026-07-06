import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGame, XP_PER_LEVEL, rankTitle } from '../game/store'
import { coinGlyph } from '../game/cosmetics'
import { POWERUPS } from '../game/powerups'

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
  const streak = useGame((s) => s.streak)
  const lastEarnAt = useGame((s) => s.lastEarnAt)
  const sfxOn = useGame((s) => s.sfxOn)
  const toggleSfx = useGame((s) => s.toggleSfx)
  const coinId = useGame((s) => s.equipped.coin)
  const glyph = coinGlyph(coinId)
  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const pct = Math.round(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)
  const shown = useTween(coins)

  return (
    <div className="no-drag flex items-center gap-2">
      {/* level + rank + xp */}
      <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1" title={rankTitle(level)}>
        <span className="text-[11px] font-bold text-glass-accent">LVL {level}</span>
        <span className="hidden text-[10px] text-ink-600 xl:inline">{rankTitle(level)}</span>
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-glass-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* coins */}
      <motion.div
        id="coin-hud"
        key={coins}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-1.5 rounded-full border border-glass-warm/40 bg-glass-warm/10 px-3 py-1"
      >
        <span className="text-[15px]">{glyph}</span>
        <span className="font-mono text-[14px] font-bold tabular-nums text-glass-warm">{shown}</span>
      </motion.div>

      {/* daily streak */}
      {streak > 0 && (
        <div className="flex items-center gap-1 rounded-full border border-glass-warm/30 bg-glass-warm/5 px-2 py-1 text-[12px] font-bold text-glass-warm" title={`${streak}-day streak`}>
          🔥 {streak}
        </div>
      )}

      {/* active power-up boosts */}
      <BoostPills />

      {/* live combo + draining timer */}
      {combo >= 2 && <ComboMeter combo={combo} lastEarnAt={lastEarnAt} />}

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

/** Pulsing pills for each running power-up, with a live m:ss countdown. */
function BoostPills() {
  const boosts = useGame((s) => s.boosts)
  const [now, setNow] = useState(Date.now())
  const active = POWERUPS.filter((p) => (boosts[p.id] ?? 0) > now)

  useEffect(() => {
    if (active.length === 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active.length])

  if (active.length === 0) return null
  return (
    <>
      {active.map((p) => {
        const left = Math.max(0, (boosts[p.id] ?? 0) - now)
        const m = Math.floor(left / 60_000)
        const s = Math.floor((left % 60_000) / 1000)
        return (
          <motion.div
            key={p.id}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            title={`${p.name} — ${p.blurb}`}
            className="flex items-center gap-1 rounded-full border border-glass-accent2/40 bg-glass-accent2/10 px-2 py-1 text-[11px] font-bold text-glass-accent2"
          >
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
              {p.emoji}
            </motion.span>
            <span className="font-mono tabular-nums">
              {m}:{String(s).padStart(2, '0')}
            </span>
          </motion.div>
        )
      })}
    </>
  )
}

function comboColor(combo: number): string {
  if (combo >= 8) return '#ff5db1'
  if (combo >= 6) return '#f85149'
  if (combo >= 4) return '#ff8a3d'
  return '#ffb86b'
}

/** Live combo badge with a draining urgency bar — keep acting or lose the streak. */
function ComboMeter({ combo, lastEarnAt }: { combo: number; lastEarnAt: number }) {
  const [frac, setFrac] = useState(1)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      // comboWindowMs() stretches when Combo Freeze is running.
      const windowMs = useGame.getState().comboWindowMs()
      const remaining = Math.max(0, 1 - (Date.now() - lastEarnAt) / windowMs)
      setFrac(remaining)
      if (remaining > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lastEarnAt])

  const color = comboColor(combo)
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-stretch gap-0.5 rounded-lg px-2 py-1"
      style={{ background: color, boxShadow: combo >= 6 ? `0 0 14px ${color}` : 'none' }}
    >
      <span className="text-center text-[12px] font-black leading-none text-ink-950">🔥 {combo}x</span>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-ink-950/30">
        <div className="h-full rounded-full bg-ink-950/80" style={{ width: `${frac * 100}%` }} />
      </div>
    </motion.div>
  )
}
