import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame, type Fx } from '../game/store'

const CONFETTI_COLORS = ['#7c9cff', '#5ee0c0', '#ffb86b', '#f85149', '#ffd23f', '#b07cff']

/** Full-screen, click-through layer that renders all the juice. */
export default function FxLayer() {
  const fx = useGame((s) => s.fx)
  const pop = useGame((s) => s.popFx)
  const seen = useRef(new Set<number>())

  // Screen shake on big wins.
  useEffect(() => {
    for (const f of fx) {
      if (seen.current.has(f.id)) continue
      seen.current.add(f.id)
      if (f.kind === 'crit' || f.kind === 'jackpot' || f.kind === 'levelup') {
        const cls = f.kind === 'jackpot' ? 'shake-hard' : 'shake'
        document.body.classList.add(cls)
        setTimeout(() => document.body.classList.remove(cls), 450)
      }
    }
    if (seen.current.size > 200) seen.current = new Set(fx.map((f) => f.id))
  }, [fx])

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      <AnimatePresence>
        {fx.map((f) => (
          <FxItem key={f.id} fx={f} done={() => pop(f.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function FxItem({ fx, done }: { fx: Fx; done: () => void }) {
  if (fx.kind === 'coin') {
    const x = fx.x ?? window.innerWidth - 150
    const y = fx.y ?? 70
    const isCrit = !!fx.crit
    return (
      <motion.div
        className="absolute select-none whitespace-nowrap font-extrabold"
        style={{
          left: x,
          top: y,
          fontSize: isCrit ? 26 : 18,
          color: fx.tone === 'bad' ? '#f85149' : isCrit ? '#ff5db1' : '#ffd23f',
          textShadow: isCrit ? '0 0 14px rgba(255,93,177,0.9)' : '0 2px 8px rgba(0,0,0,0.6)'
        }}
        initial={{ opacity: 0, scale: 0.4, y: 0 }}
        animate={{ opacity: 1, scale: isCrit ? 1.4 : 1.15, y: -80 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        onAnimationComplete={done}
      >
        +{fx.amount} 🪙{isCrit && <span className="ml-1">×{fx.crit}!</span>}{' '}
        {fx.text && <span className="text-[12px] font-semibold text-white/80">{fx.text}</span>}
      </motion.div>
    )
  }

  if (fx.kind === 'crit') {
    return (
      <motion.div
        className="absolute inset-x-0 top-1/4 flex justify-center"
        initial={{ opacity: 0, scale: 0.3, rotate: -12 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1.1, 1], rotate: [-12, 4, -2, 0] }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        onAnimationComplete={done}
      >
        <div
          className="text-[64px] font-black italic"
          style={{ color: '#ff5db1', textShadow: '0 0 30px rgba(255,93,177,0.8), 0 4px 12px rgba(0,0,0,0.6)' }}
        >
          {fx.text} ×{fx.amount}
        </div>
      </motion.div>
    )
  }

  if (fx.kind === 'combo') {
    return (
      <motion.div
        className="absolute right-10 top-28 select-none text-right"
        initial={{ opacity: 0, x: 60, scale: 0.7 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.9, ease: 'backOut' }}
        onAnimationComplete={done}
      >
        <div className="text-[40px] font-black italic text-glass-warm" style={{ textShadow: '0 0 20px rgba(255,184,107,0.6)' }}>
          {fx.amount}x
        </div>
        <div className="text-[13px] font-bold uppercase tracking-widest text-glass-warm/80">combo {fx.text}</div>
      </motion.div>
    )
  }

  if (fx.kind === 'levelup') {
    return (
      <motion.div
        className="absolute inset-x-0 top-1/3 flex justify-center"
        initial={{ opacity: 0, scale: 0.5, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 1.3 }}
        transition={{ duration: 1.6, ease: 'backOut' }}
        onAnimationComplete={done}
      >
        <div className="rounded-2xl border-2 border-glass-accent2 bg-ink-900/90 px-8 py-5 text-center shadow-2xl">
          <div className="text-[12px] font-bold uppercase tracking-[0.3em] text-glass-accent2">level up</div>
          <div className="text-[52px] font-black text-white">LVL {fx.amount}</div>
        </div>
      </motion.div>
    )
  }

  if (fx.kind === 'toast') {
    return (
      <motion.div
        className="absolute inset-x-0 bottom-24 flex justify-center"
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 1.8 }}
        onAnimationComplete={done}
      >
        <div
          className={`rounded-full px-5 py-2 text-[14px] font-bold shadow-xl ${
            fx.tone === 'bad' ? 'bg-glass-del text-white' : 'bg-glass-accent2 text-ink-950'
          }`}
        >
          {fx.text}
        </div>
      </motion.div>
    )
  }

  // confetti / jackpot
  return <Confetti count={fx.kind === 'jackpot' ? 80 : 46} done={done} />
}

function Confetti({ count, done }: { count: number; done: () => void }) {
  useEffect(() => {
    const t = setTimeout(done, 2600)
    return () => clearTimeout(t)
  }, [])
  const pieces = Array.from({ length: count })
  return (
    <div className="absolute inset-0">
      {pieces.map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.2
        const dur = 1.6 + Math.random() * 1.1
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const size = 6 + Math.random() * 8
        const drift = (Math.random() - 0.5) * 240
        return (
          <motion.div
            key={i}
            className="absolute top-[-20px]"
            style={{ left: `${left}%`, width: size, height: size * 0.6, background: color, borderRadius: 2 }}
            initial={{ y: -20, opacity: 1, rotate: 0 }}
            animate={{ y: window.innerHeight + 40, x: drift, rotate: 720, opacity: [1, 1, 0.8, 0] }}
            transition={{ duration: dur, delay, ease: 'easeIn' }}
          />
        )
      })}
    </div>
  )
}
