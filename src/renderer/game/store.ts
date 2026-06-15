import { create } from 'zustand'
import { play, setMuted } from './sfx'

const COMBO_WINDOW_MS = 7000
export const XP_PER_LEVEL = 400

export type FxKind = 'coin' | 'confetti' | 'levelup' | 'combo' | 'toast' | 'jackpot'

export interface Fx {
  id: number
  kind: FxKind
  text?: string
  amount?: number
  x?: number
  y?: number
  tone?: 'good' | 'bad' | 'neutral'
}

export interface Achievement {
  id: string
  label: string
  emoji: string
}

const ACHIEVEMENTS: Record<string, Achievement> = {
  first_section: { id: 'first_section', label: 'First steps', emoji: '👣' },
  quiz_ace: { id: 'quiz_ace', label: 'Quiz Ace', emoji: '🧠' },
  hot_streak: { id: 'hot_streak', label: 'On fire (x5 combo)', emoji: '🔥' },
  big_brain: { id: 'big_brain', label: 'Big Brain (scored 90+)', emoji: '🤯' },
  full_clear: { id: 'full_clear', label: 'Full Clear', emoji: '🏆' },
  high_roller: { id: 'high_roller', label: 'High Roller', emoji: '🎰' }
}

interface AwardOpts {
  x?: number
  y?: number
  reason?: string
  sound?: Parameters<typeof play>[0]
  confetti?: boolean
}

interface GameState {
  coins: number
  xp: number
  lifetimeCoins: number
  combo: number
  bestCombo: number
  lastEarnAt: number
  sfxOn: boolean
  achievements: string[]
  rewarded: Record<string, true>
  fx: Fx[]

  level: () => number
  levelProgress: () => { inLevel: number; needed: number; pct: number }

  award: (base: number, opts?: AwardOpts) => number
  rewardOnce: (key: string, base: number, opts?: AwardOpts) => number
  spend: (amount: number) => boolean
  breakCombo: () => void
  toggleSfx: () => void
  unlock: (id: string) => void
  pushFx: (fx: Omit<Fx, 'id'>) => void
  popFx: (id: number) => void
  resetProfile: () => void
}

let fxId = 1

const LS_KEY = 'glassbox.profile.v1'

function load(): Partial<GameState> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function comboMultiplier(combo: number): number {
  // x1 at combo 1, +0.25 per step, capped at x3.
  return Math.min(3, 1 + Math.max(0, combo - 1) * 0.25)
}

export const useGame = create<GameState>((set, get) => {
  const saved = load()

  const persist = () => {
    const s = get()
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        coins: s.coins,
        xp: s.xp,
        lifetimeCoins: s.lifetimeCoins,
        bestCombo: s.bestCombo,
        sfxOn: s.sfxOn,
        achievements: s.achievements,
        rewarded: s.rewarded
      })
    )
  }

  setMuted(!(saved.sfxOn ?? true))

  return {
    coins: saved.coins ?? 0,
    xp: saved.xp ?? 0,
    lifetimeCoins: saved.lifetimeCoins ?? 0,
    combo: 0,
    bestCombo: saved.bestCombo ?? 0,
    lastEarnAt: 0,
    sfxOn: saved.sfxOn ?? true,
    achievements: saved.achievements ?? [],
    rewarded: saved.rewarded ?? {},
    fx: [],

    level: () => Math.floor(get().xp / XP_PER_LEVEL) + 1,
    levelProgress: () => {
      const xp = get().xp
      const inLevel = xp % XP_PER_LEVEL
      return { inLevel, needed: XP_PER_LEVEL, pct: Math.round((inLevel / XP_PER_LEVEL) * 100) }
    },

    award: (base, opts = {}) => {
      const now = Date.now()
      const s = get()
      const within = now - s.lastEarnAt < COMBO_WINDOW_MS
      const combo = within ? s.combo + 1 : 1
      const mult = comboMultiplier(combo)
      const total = Math.max(1, Math.round(base * mult))
      const prevLevel = s.level()

      set({
        coins: s.coins + total,
        xp: s.xp + total,
        lifetimeCoins: s.lifetimeCoins + total,
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        lastEarnAt: now
      })

      if (s.sfxOn) play(opts.sound ?? 'coin')

      get().pushFx({
        kind: 'coin',
        amount: total,
        text: opts.reason,
        x: opts.x,
        y: opts.y,
        tone: 'good'
      })

      if (combo >= 2) {
        get().pushFx({ kind: 'combo', amount: combo, text: `${mult.toFixed(2)}x` })
        if (s.sfxOn) play('combo')
      }
      if (combo === 5) get().unlock('hot_streak')
      if (opts.confetti) get().pushFx({ kind: 'confetti' })

      const newLevel = get().level()
      if (newLevel > prevLevel) {
        get().pushFx({ kind: 'levelup', amount: newLevel })
        if (s.sfxOn) play('levelup')
      }

      persist()
      return total
    },

    rewardOnce: (key, base, opts) => {
      if (get().rewarded[key]) return 0
      set((s) => ({ rewarded: { ...s.rewarded, [key]: true } }))
      return get().award(base, opts)
    },

    spend: (amount) => {
      const s = get()
      if (s.coins < amount) {
        if (s.sfxOn) play('wrong')
        get().pushFx({ kind: 'toast', text: `Need ${amount - s.coins} more 🪙`, tone: 'bad' })
        return false
      }
      set({ coins: s.coins - amount })
      if (s.sfxOn) play('purchase')
      persist()
      return true
    },

    breakCombo: () => {
      if (get().combo > 0) set({ combo: 0, lastEarnAt: 0 })
    },

    toggleSfx: () => {
      const next = !get().sfxOn
      set({ sfxOn: next })
      setMuted(!next)
      if (next) play('tick')
      persist()
    },

    unlock: (id) => {
      const s = get()
      if (s.achievements.includes(id) || !ACHIEVEMENTS[id]) return
      set({ achievements: [...s.achievements, id] })
      const a = ACHIEVEMENTS[id]
      get().pushFx({ kind: 'toast', text: `${a.emoji} ${a.label}`, tone: 'good' })
      get().pushFx({ kind: 'confetti' })
      if (s.sfxOn) play('jackpot')
      persist()
    },

    pushFx: (fx) => set((s) => ({ fx: [...s.fx, { ...fx, id: fxId++ }] })),
    popFx: (id) => set((s) => ({ fx: s.fx.filter((f) => f.id !== id) })),

    resetProfile: () => {
      set({ coins: 0, xp: 0, lifetimeCoins: 0, combo: 0, bestCombo: 0, achievements: [], rewarded: {} })
      persist()
    }
  }
})

export { ACHIEVEMENTS }
