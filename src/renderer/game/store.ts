import { create } from 'zustand'
import { play, playCombo, setMuted, setPack } from './sfx'
import { DEFAULT_EQUIPPED, cosmeticById, type CosmeticSlot } from './cosmetics'

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
  high_roller: { id: 'high_roller', label: 'High Roller', emoji: '🎰' },
  code_breaker: { id: 'code_breaker', label: 'Code Breaker', emoji: '🕵️' },
  bug_hunter: { id: 'bug_hunter', label: 'Bug Hunter', emoji: '🐛' },
  eagle_eye: { id: 'eagle_eye', label: 'Eagle Eye (cleared a hunt)', emoji: '🦅' },
  flawless: { id: 'flawless', label: 'Flawless Decode', emoji: '🎯' },
  stylish: { id: 'stylish', label: 'Big Drip', emoji: '🛍️' },
  boss_slain: { id: 'boss_slain', label: 'Boss Slain', emoji: '⚔️' }
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

  // cosmetics (the shop)
  owned: string[]
  equipped: Record<CosmeticSlot, string>

  // spaced repetition (the review deck): card key -> schedule
  srs: Record<string, { due: number; ease: number; reps: number }>

  // speedrun personal bests: key -> fastest time in ms (lower is better)
  bestTimes: Record<string, number>

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
  ownsCosmetic: (id: string) => boolean
  buyCosmetic: (id: string) => boolean
  equipCosmetic: (slot: CosmeticSlot, id: string) => void
  reviewCard: (key: string, correct: boolean) => void
  dueCount: (keys: string[]) => number
  recordTime: (key: string, ms: number) => boolean
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
        spins: s.spins,
        owned: s.owned,
        equipped: s.equipped,
        srs: s.srs,
        bestTimes: s.bestTimes
      })
    )
  }

  setMuted(!(saved.sfxOn ?? true))
  setPack(saved.equipped?.sound ?? DEFAULT_EQUIPPED.sound)

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

    owned: saved.owned ?? [],
    equipped: { ...DEFAULT_EQUIPPED, ...(saved.equipped ?? {}) },
    srs: saved.srs ?? {},
    bestTimes: saved.bestTimes ?? {},

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

    ownsCosmetic: (id) => {
      const c = cosmeticById(id)
      if (!c) return false
      return c.price === 0 || get().owned.includes(id)
    },

    buyCosmetic: (id) => {
      const c = cosmeticById(id)
      if (!c) return false
      // Already owned (or a free default): just equip it.
      if (c.price === 0 || get().owned.includes(id)) {
        get().equipCosmetic(c.slot, id)
        return true
      }
      if (!get().spend(c.price)) return false // spend() handles the "need more" toast
      set((s) => ({ owned: [...s.owned, id] }))
      get().equipCosmetic(c.slot, id)
      get().unlock('stylish')
      get().pushFx({ kind: 'toast', text: `Unlocked ${c.name} 🛍️`, tone: 'good' })
      persist()
      return true
    },

    equipCosmetic: (slot, id) => {
      set((s) => ({ equipped: { ...s.equipped, [slot]: id } }))
      if (slot === 'sound') setPack(id)
      if (get().sfxOn) play('tick')
      persist()
    },

    // SM-2-lite: correct pushes the next review out (1d, 3d, 7d, then ×ease);
    // a miss resets the card to ~10 minutes so it comes back this session.
    reviewCard: (key, correct) => {
      const now = Date.now()
      const cur = get().srs[key] ?? { due: now, ease: 2.3, reps: 0 }
      let next: { due: number; ease: number; reps: number }
      if (correct) {
        const reps = cur.reps + 1
        const ease = Math.min(2.8, cur.ease + 0.1)
        const days = reps === 1 ? 1 : reps === 2 ? 3 : reps === 3 ? 7 : Math.round(7 * Math.pow(ease, reps - 3))
        next = { due: now + days * 86_400_000, ease, reps }
      } else {
        next = { due: now + 10 * 60_000, ease: Math.max(1.3, cur.ease - 0.2), reps: 0 }
      }
      set((s) => ({ srs: { ...s.srs, [key]: next } }))
      persist()
    },

    // A card with no schedule yet counts as due (never reviewed).
    dueCount: (keys) => {
      const now = Date.now()
      const srs = get().srs
      return keys.filter((k) => !srs[k] || srs[k].due <= now).length
    },

    // Record a speedrun time; keeps only the fastest. Returns true on a new best.
    recordTime: (key, ms) => {
      const cur = get().bestTimes[key]
      if (cur !== undefined && cur <= ms) return false
      set((s) => ({ bestTimes: { ...s.bestTimes, [key]: ms } }))
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
        streak: 0, bestStreak: 0, lastActiveDay: '', dailyClaimedDay: '', spins: 0,
        owned: [], equipped: { ...DEFAULT_EQUIPPED }, srs: {}, bestTimes: {}
      })
      setPack(DEFAULT_EQUIPPED.sound)
      persist()
    }
  }
})

export { ACHIEVEMENTS }
