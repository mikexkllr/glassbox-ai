import { create } from 'zustand'
import { play, playCombo, setMuted } from './sfx'

export const COMBO_WINDOW_MS = 7000
export const XP_PER_LEVEL = 400

const RANKS = [
  'Intern',
  'Script Kiddie',
  'Code Reader',
  'Diff Diver',
  'Reviewer',
  'Senior',
  'Architect',
  'Code Whisperer',
  'Refactor Wizard',
  'Legend'
]
export function rankTitle(level: number): string {
  return RANKS[Math.min(RANKS.length - 1, level - 1)] ?? 'Legend'
}

export type FxKind = 'coin' | 'confetti' | 'levelup' | 'combo' | 'toast' | 'jackpot' | 'crit' | 'hype'

const HYPE: Record<number, string> = {
  3: 'NICE 🔥',
  5: 'INSANE 🔥🔥',
  7: 'CRACKED 🤯',
  9: 'GODLIKE 🗿',
  12: 'BRAINROTTED 🧠💥'
}
function hypeFor(combo: number): string | null {
  if (HYPE[combo]) return HYPE[combo]
  if (combo > 12 && combo % 3 === 0) return `UNSTOPPABLE ×${combo} 💀`
  return null
}

export interface Fx {
  id: number
  kind: FxKind
  text?: string
  amount?: number
  x?: number
  y?: number
  tone?: 'good' | 'bad' | 'neutral'
  crit?: number
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

  // streak
  streak: number
  bestStreak: number
  lastActiveDay: string
  dailyClaimedDay: string
  // lifetime stats
  spins: number

  level: () => number
  levelProgress: () => { inLevel: number; needed: number; pct: number }

  award: (base: number, opts?: AwardOpts) => number
  rewardOnce: (key: string, base: number, opts?: AwardOpts) => number
  spend: (amount: number) => boolean
  breakCombo: () => void
  toggleSfx: () => void
  unlock: (id: string) => void
  mark: (key: string) => void
  countPrefix: (prefix: string) => number
  touchDay: () => void
  claimDaily: () => number
  recordSpin: () => void
  pushFx: (fx: Omit<Fx, 'id'>) => void
  popFx: (id: number) => void
  resetProfile: () => void
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function dayDiff(a: string, b: string): number {
  const da = Date.parse(a + 'T00:00:00')
  const db = Date.parse(b + 'T00:00:00')
  if (isNaN(da) || isNaN(db)) return 99
  return Math.round((db - da) / 86_400_000)
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
        rewarded: s.rewarded,
        streak: s.streak,
        bestStreak: s.bestStreak,
        lastActiveDay: s.lastActiveDay,
        dailyClaimedDay: s.dailyClaimedDay,
        spins: s.spins
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

    streak: saved.streak ?? 0,
    bestStreak: saved.bestStreak ?? 0,
    lastActiveDay: saved.lastActiveDay ?? '',
    dailyClaimedDay: saved.dailyClaimedDay ?? '',
    spins: saved.spins ?? 0,

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

      // Variable reward: random crit (the slot-machine core).
      const roll = Math.random()
      const critMult = roll < 0.04 ? 3 : roll < 0.2 ? 2 : 1
      const total = Math.max(1, Math.round(base * mult * critMult))
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
        tone: 'good',
        crit: critMult > 1 ? critMult : undefined
      })

      if (critMult > 1) {
        get().pushFx({ kind: 'crit', amount: critMult, text: critMult === 3 ? 'MEGA CRIT!' : 'CRIT!' })
        if (s.sfxOn) play(critMult === 3 ? 'jackpot' : 'crit')
      }

      if (combo >= 2) {
        get().pushFx({ kind: 'combo', amount: combo, text: `${mult.toFixed(2)}x` })
        if (s.sfxOn) playCombo(combo)
      }
      const hype = hypeFor(combo)
      if (hype) {
        get().pushFx({ kind: 'hype', amount: combo, text: hype })
        if (s.sfxOn) play('crit')
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

    mark: (key) => {
      if (get().rewarded[key]) return
      set((s) => ({ rewarded: { ...s.rewarded, [key]: true } }))
      persist()
    },

    countPrefix: (prefix) => Object.keys(get().rewarded).filter((k) => k.startsWith(prefix)).length,

    touchDay: () => {
      const today = todayStr()
      const s = get()
      if (s.lastActiveDay === today) return
      const diff = s.lastActiveDay ? dayDiff(s.lastActiveDay, today) : 99
      const streak = diff === 1 ? s.streak + 1 : 1
      set({ streak, bestStreak: Math.max(s.bestStreak, streak), lastActiveDay: today })
      persist()
    },

    claimDaily: () => {
      const today = todayStr()
      const s = get()
      if (s.dailyClaimedDay === today) return 0
      set({ dailyClaimedDay: today })
      const amount = 30 + Math.max(0, s.streak - 1) * 15
      get().award(amount, { reason: `day ${Math.max(1, s.streak)} 🔥`, sound: 'levelup', confetti: true })
      persist()
      return amount
    },

    recordSpin: () => {
      set((s) => ({ spins: s.spins + 1 }))
      persist()
    },

    pushFx: (fx) => set((s) => ({ fx: [...s.fx, { ...fx, id: fxId++ }] })),
    popFx: (id) => set((s) => ({ fx: s.fx.filter((f) => f.id !== id) })),

    resetProfile: () => {
      set({
        coins: 0, xp: 0, lifetimeCoins: 0, combo: 0, bestCombo: 0, achievements: [], rewarded: {},
        streak: 0, bestStreak: 0, lastActiveDay: '', dailyClaimedDay: '', spins: 0
      })
      persist()
    }
  }
})

export { ACHIEVEMENTS }
