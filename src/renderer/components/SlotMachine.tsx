import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGame } from '../game/store'
import { play } from '../game/sfx'

const COST = 20
const POOL = ['🪙', '🪙', '🪙', '🍒', '🍒', '🔔', '🔔', '⭐', '⭐', '💎', '7️⃣', '🐛', '🐛']
const PAYOUT3: Record<string, number> = { '7️⃣': 300, '💎': 150, '⭐': 120, '🔔': 100, '🍒': 80, '🪙': 60 }
const pick = () => POOL[Math.floor(Math.random() * POOL.length)]

/** A literal, deliberately silly slot machine. Spend coins, pray to RNGesus. */
export default function SlotMachine() {
  const coins = useGame((s) => s.coins)
  const spend = useGame((s) => s.spend)
  const award = useGame((s) => s.award)
  const recordSpin = useGame((s) => s.recordSpin)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const [reels, setReels] = useState(['❓', '❓', '❓'])
  const [spinning, setSpinning] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' } | null>(null)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const settle = (finals: string[]) => {
    const [a, b, c] = finals
    let win = 0
    let text = 'No luck — spin again 🎲'
    let tone: 'win' | 'lose' = 'lose'
    if (a === '🐛' && b === '🐛' && c === '🐛') {
      text = 'THREE BUGS 🐛🐛🐛 — you shipped to prod on a Friday. No payout.'
      if (sfxOn) play('wrong')
    } else if (a === b && b === c) {
      win = PAYOUT3[a] ?? 60
      text = `JACKPOT! ${a}${a}${a}`
      tone = 'win'
    } else if (a === b || b === c || a === c) {
      win = 25
      text = 'Two of a kind — small win!'
      tone = 'win'
    } else {
      if (sfxOn) play('wrong')
    }
    if (win > 0) {
      const got = award(win, { reason: 'slots', sound: 'jackpot', confetti: win >= 100 })
      pushFx({ kind: 'jackpot' })
      setMsg({ text: `${text}  +${got}🪙`, tone })
    } else {
      setMsg({ text, tone })
    }
    setSpinning(false)
  }

  const spin = () => {
    if (spinning) return
    if (!spend(COST)) return
    recordSpin()
    setMsg(null)
    setSpinning(true)
    if (sfxOn) play('whoosh')
    const finals = [pick(), pick(), pick()]
    const stopped = [false, false, false]
    ivRef.current = setInterval(() => {
      setReels((d) => d.map((v, i) => (stopped[i] ? finals[i] : pick())))
    }, 80)
    setTimeout(() => {
      stopped[0] = true
      if (sfxOn) play('tick')
    }, 650)
    setTimeout(() => {
      stopped[1] = true
      if (sfxOn) play('tick')
    }, 950)
    setTimeout(() => {
      stopped[2] = true
      if (ivRef.current) clearInterval(ivRef.current)
      setReels(finals)
      if (sfxOn) play('tick')
      settle(finals)
    }, 1300)
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 text-[12px] text-ink-600">Spend {COST}🪙 per spin · match 3 to win · avoid the bugs 🐛</div>
      <div className="my-3 flex gap-3 rounded-2xl border-2 border-glass-warm/50 bg-ink-950 p-4 shadow-inner">
        {reels.map((r, i) => (
          <motion.div
            key={i}
            animate={spinning ? { y: [0, -6, 0] } : {}}
            transition={{ duration: 0.15, repeat: spinning ? Infinity : 0 }}
            className="flex h-20 w-20 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-[44px]"
          >
            {r}
          </motion.div>
        ))}
      </div>

      {msg && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`mb-3 max-w-sm text-center text-[13px] font-bold ${msg.tone === 'win' ? 'text-glass-add' : 'text-glass-warm'}`}
        >
          {msg.text}
        </motion.div>
      )}

      <button
        onClick={spin}
        disabled={spinning || coins < COST}
        className="no-drag rounded-xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-8 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        {spinning ? '🎰 spinning…' : `🎰 SPIN (−${COST}🪙)`}
      </button>
      {coins < COST && <p className="mt-2 text-[11px] text-glass-del">Not enough coins — go learn some code 🤓</p>}
    </div>
  )
}
