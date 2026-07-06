// Consumable power-ups — the strategic coin sink. Unlike cosmetics they are
// temporary: buying one starts (or extends) a timed boost that changes how the
// reward engine behaves while active. Effects are applied inside the game
// store's award()/combo logic by checking boostActive(id).

export interface Powerup {
  id: string
  name: string
  emoji: string
  price: number
  durationMs: number
  blurb: string
}

export const POWERUPS: Powerup[] = [
  {
    id: 'surge',
    name: 'Coin Surge',
    emoji: '⚡',
    price: 150,
    durationMs: 5 * 60_000,
    blurb: 'Every reward pays 2× for 5 minutes.'
  },
  {
    id: 'lucky',
    name: 'Lucky Charm',
    emoji: '🍀',
    price: 120,
    durationMs: 5 * 60_000,
    blurb: 'Crit chance tripled for 5 minutes.'
  },
  {
    id: 'freeze',
    name: 'Combo Freeze',
    emoji: '🧊',
    price: 100,
    durationMs: 3 * 60_000,
    blurb: 'Combo timer drains 3× slower for 3 minutes.'
  }
]

export function powerupById(id: string): Powerup | undefined {
  return POWERUPS.find((p) => p.id === id)
}
