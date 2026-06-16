import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGame, ACHIEVEMENTS, rankTitle, todayStr } from '../game/store'
import SlotMachine from './SlotMachine'
import { cn } from '../lib/files'

type Tab = 'daily' | 'quests' | 'slots' | 'stats'

export default function Arcade({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('daily')
  return (
    <div data-overlay className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-h-full w-[600px] overflow-hidden rounded-2xl border border-glass-accent/40 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-white">🕹️ Arcade</h2>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">✕</button>
        </div>

        <div className="flex gap-1 border-b border-ink-800 px-3 py-2">
          {(['daily', 'quests', 'slots', 'stats'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'no-drag rounded-lg px-3 py-1.5 text-[12.5px] font-medium capitalize',
                tab === t ? 'bg-glass-accent/20 text-glass-accent' : 'text-gray-400 hover:text-white'
              )}
            >
              {t === 'daily' ? '🔥 Daily' : t === 'quests' ? '🎯 Quests' : t === 'slots' ? '🎰 Slots' : '📊 Stats'}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {tab === 'daily' && <Daily />}
          {tab === 'quests' && <Quests />}
          {tab === 'slots' && <SlotMachine />}
          {tab === 'stats' && <Stats />}
        </div>
      </motion.div>
    </div>
  )
}

function Daily() {
  const streak = useGame((s) => s.streak)
  const bestStreak = useGame((s) => s.bestStreak)
  const claimedDay = useGame((s) => s.dailyClaimedDay)
  const claimDaily = useGame((s) => s.claimDaily)
  const [claimed, setClaimed] = useState(claimedDay === todayStr())

  const amount = 30 + Math.max(0, streak - 1) * 15

  return (
    <div className="text-center">
      <div className="text-[56px]">🔥</div>
      <div className="text-[28px] font-black text-glass-warm">{streak}-day streak</div>
      <div className="mb-4 text-[12px] text-ink-600">best: {bestStreak} days · come back daily to keep it alive</div>

      <div className="mx-auto flex max-w-xs items-center justify-center gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={cn('h-2.5 flex-1 rounded-full', i < streak % 7 || (streak > 0 && streak % 7 === 0) ? 'bg-glass-warm' : 'bg-ink-800')}
          />
        ))}
      </div>

      <button
        disabled={claimed}
        onClick={() => {
          claimDaily()
          setClaimed(true)
        }}
        className="no-drag mt-5 rounded-xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-6 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        {claimed ? 'Daily bonus claimed ✓' : `Claim daily bonus +${amount}🪙`}
      </button>
      {!claimed && <p className="mt-2 text-[11px] text-ink-600">grows +15🪙 for every day in your streak</p>}
    </div>
  )
}

interface Quest {
  id: string
  label: string
  emoji: string
  goal: number
  reward: number
  progress: (g: ReturnType<typeof useGame.getState>) => number
}

const QUESTS: Quest[] = [
  { id: 'insights8', label: 'Reveal 8 insights', emoji: '💡', goal: 8, reward: 40, progress: (g) => g.countPrefix('insight:') },
  { id: 'quiz5', label: 'Ace 5 quizzes', emoji: '🧠', goal: 5, reward: 50, progress: (g) => g.countPrefix('quizsolved:') },
  { id: 'sections3', label: 'Explore 3 sections', emoji: '📂', goal: 3, reward: 30, progress: (g) => g.countPrefix('section:open:') },
  { id: 'chest1', label: 'Open a mastery chest', emoji: '🧰', goal: 1, reward: 60, progress: (g) => g.countPrefix('chest:') },
  { id: 'combo5', label: 'Hit a 5× combo', emoji: '🔥', goal: 5, reward: 50, progress: (g) => g.bestCombo },
  { id: 'spin5', label: 'Spin the slots 5×', emoji: '🎰', goal: 5, reward: 40, progress: (g) => g.spins }
]

function Quests() {
  const g = useGame()
  const rewardOnce = useGame((s) => s.rewardOnce)

  return (
    <div className="space-y-2">
      {QUESTS.map((q) => {
        const prog = Math.min(q.goal, q.progress(g))
        const done = prog >= q.goal
        const claimed = !!g.rewarded[`quest:${q.id}`]
        const pct = Math.round((prog / q.goal) * 100)
        return (
          <div key={q.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850/50 p-3">
            <div className="text-[24px]">{q.emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-gray-100">{q.label}</span>
                <span className="text-[11px] text-ink-600">
                  {prog}/{q.goal} · +{q.reward}🪙
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-glass-accent2 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <button
              disabled={!done || claimed}
              onClick={() => rewardOnce(`quest:${q.id}`, q.reward, { reason: 'quest!', sound: 'levelup', confetti: true })}
              className={cn(
                'no-drag rounded-lg px-3 py-1.5 text-[12px] font-bold',
                claimed ? 'text-ink-600' : done ? 'bg-glass-accent2 text-ink-950 hover:brightness-110' : 'bg-ink-800 text-ink-600'
              )}
            >
              {claimed ? '✓' : done ? 'Claim' : 'Locked'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Stats() {
  const g = useGame()
  const level = Math.floor(g.xp / 400) + 1
  const rows: [string, string | number][] = [
    ['Level', `${level} · ${rankTitle(level)}`],
    ['Lifetime coins', g.lifetimeCoins],
    ['Best combo', `${g.bestCombo}×`],
    ['Best streak', `${g.bestStreak} days`],
    ['Sections explored', g.countPrefix('section:open:')],
    ['Insights revealed', g.countPrefix('insight:')],
    ['Quizzes aced', g.countPrefix('quizsolved:')],
    ['Chests opened', g.countPrefix('chest:')],
    ['Slot spins', g.spins]
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-ink-700 bg-ink-850/50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-600">{k}</div>
            <div className="text-[16px] font-bold text-white">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-600">Achievements</div>
        <div className="flex flex-wrap gap-2">
          {Object.values(ACHIEVEMENTS).map((a) => {
            const got = g.achievements.includes(a.id)
            return (
              <div
                key={a.id}
                title={a.label}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]',
                  got ? 'border-glass-warm/40 bg-glass-warm/10 text-glass-warm' : 'border-ink-700 text-ink-600 grayscale'
                )}
              >
                <span>{a.emoji}</span>
                <span>{got ? a.label : '???'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
