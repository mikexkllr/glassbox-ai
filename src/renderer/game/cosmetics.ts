// Central catalog for the cosmetic shop — the coin sink. Each cosmetic is a
// purchasable, equippable item that visibly changes the real app. Defaults are
// free (price 0) and are considered owned implicitly. Item ids are unique across
// every slot, so a single `owned` list and a per-slot `equipped` map are enough.

export type CosmeticSlot = 'theme' | 'confetti' | 'coin' | 'sound' | 'trail'

export interface Cosmetic {
  id: string
  slot: CosmeticSlot
  name: string
  price: number
  blurb: string
}

export const SLOT_META: Record<CosmeticSlot, { label: string; emoji: string; hint: string }> = {
  theme: { label: 'Code themes', emoji: '🎨', hint: 'Recolor every code block, live' },
  confetti: { label: 'Confetti', emoji: '🎉', hint: 'Your celebration palette' },
  coin: { label: 'Coin skins', emoji: '🪙', hint: 'Reskin your currency everywhere' },
  sound: { label: 'Sound packs', emoji: '🔊', hint: 'Retune the whole UI' },
  trail: { label: 'Cursor trails', emoji: '✨', hint: 'Leave a wake behind your cursor' }
}

// --- Code themes (shiki). Names must exist in the bundled themes. ---
export const THEME_DEFAULT = 'vitesse-dark'

// --- Confetti palettes (consumed by FxLayer) ---
export const CONFETTI_PALETTES: Record<string, string[]> = {
  classic: ['#7c9cff', '#5ee0c0', '#ffb86b', '#f85149', '#ffd23f', '#b07cff'],
  neon: ['#ff5db1', '#5ee0c0', '#7c9cff', '#ffd23f', '#ff8a3d'],
  goldrush: ['#ffd23f', '#ffb86b', '#ffe9a8', '#f5c518', '#fff3c4'],
  vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'],
  matrix: ['#39ff14', '#2ea043', '#5ee0c0', '#aaffaa', '#1aff66']
}
export function confettiColors(id: string | undefined): string[] {
  return CONFETTI_PALETTES[id ?? 'classic'] ?? CONFETTI_PALETTES.classic
}

// --- Coin skins (consumed by CoinHud + FxLayer) ---
export const COIN_GLYPHS: Record<string, string> = {
  coin: '🪙',
  gem: '💎',
  star: '⭐',
  donut: '🍩',
  money: '💸',
  brain: '🧠',
  crown: '👑'
}
export function coinGlyph(id: string | undefined): string {
  return COIN_GLYPHS[id ?? 'coin'] ?? COIN_GLYPHS.coin
}

// --- Cursor trails (style consumed by CursorTrail) ---
export interface TrailStyle {
  kind: 'emoji' | 'dot'
  glyph?: string
  colors?: string[]
}
export const TRAIL_STYLES: Record<string, TrailStyle> = {
  none: { kind: 'dot', colors: [] },
  coins: { kind: 'emoji', glyph: '🪙' },
  sparkles: { kind: 'emoji', glyph: '✨' },
  comet: { kind: 'dot', colors: ['#7c9cff', '#5ee0c0', '#b07cff'] },
  hearts: { kind: 'emoji', glyph: '💖' },
  fire: { kind: 'emoji', glyph: '🔥' }
}

export const DEFAULT_EQUIPPED: Record<CosmeticSlot, string> = {
  theme: THEME_DEFAULT,
  confetti: 'classic',
  coin: 'coin',
  sound: 'arcade',
  trail: 'none'
}

export const COSMETICS: Cosmetic[] = [
  // themes
  { id: 'vitesse-dark', slot: 'theme', name: 'Vitesse Dark', price: 0, blurb: 'The house default.' },
  { id: 'github-dark', slot: 'theme', name: 'GitHub Dark', price: 120, blurb: 'Cozy and familiar.' },
  { id: 'one-dark-pro', slot: 'theme', name: 'One Dark Pro', price: 150, blurb: 'The Atom classic.' },
  { id: 'nord', slot: 'theme', name: 'Nord', price: 180, blurb: 'Arctic icy blues.' },
  { id: 'tokyo-night', slot: 'theme', name: 'Tokyo Night', price: 220, blurb: 'Neon after dark.' },
  { id: 'dracula', slot: 'theme', name: 'Dracula', price: 240, blurb: 'Purple vampire vibes.' },
  { id: 'catppuccin-mocha', slot: 'theme', name: 'Catppuccin Mocha', price: 300, blurb: 'Soft pastel mocha.' },
  { id: 'synthwave-84', slot: 'theme', name: "SynthWave '84", price: 400, blurb: 'Retro glow overload.' },
  // confetti
  { id: 'classic', slot: 'confetti', name: 'Classic', price: 0, blurb: 'House confetti.' },
  { id: 'neon', slot: 'confetti', name: 'Neon Pop', price: 80, blurb: 'Hot pink + cyan.' },
  { id: 'goldrush', slot: 'confetti', name: 'Gold Rush', price: 120, blurb: 'Rain pure gold.' },
  { id: 'vaporwave', slot: 'confetti', name: 'Vaporwave', price: 160, blurb: 'A E S T H E T I C.' },
  { id: 'matrix', slot: 'confetti', name: 'Matrix', price: 160, blurb: 'Follow the green.' },
  // coin skins
  { id: 'coin', slot: 'coin', name: 'Gold Coin', price: 0, blurb: 'The OG.' },
  { id: 'gem', slot: 'coin', name: 'Gemstone', price: 100, blurb: 'Shinier currency.' },
  { id: 'star', slot: 'coin', name: 'Star', price: 100, blurb: 'Stack stars.' },
  { id: 'donut', slot: 'coin', name: 'Donut', price: 140, blurb: 'Mmm, donuts.' },
  { id: 'money', slot: 'coin', name: 'Cash', price: 160, blurb: 'Make it rain.' },
  { id: 'brain', slot: 'coin', name: 'Big Brain', price: 200, blurb: 'Galaxy-brain money.' },
  { id: 'crown', slot: 'coin', name: 'Crown', price: 260, blurb: 'Royalty only.' },
  // sound packs
  { id: 'arcade', slot: 'sound', name: 'Arcade', price: 0, blurb: 'Punchy default blips.' },
  { id: 'chiptune', slot: 'sound', name: 'Chiptune', price: 120, blurb: '8-bit square waves.' },
  { id: 'mellow', slot: 'sound', name: 'Mellow', price: 120, blurb: 'Soft sine tones.' },
  { id: 'retro', slot: 'sound', name: 'Retro', price: 160, blurb: 'Warm triangle buzz.' },
  // trails
  { id: 'none', slot: 'trail', name: 'None', price: 0, blurb: 'No trail.' },
  { id: 'coins', slot: 'trail', name: 'Coin Trail', price: 90, blurb: 'Drop coins as you move.' },
  { id: 'sparkles', slot: 'trail', name: 'Sparkles', price: 90, blurb: 'Fairy-dust cursor.' },
  { id: 'comet', slot: 'trail', name: 'Comet', price: 130, blurb: 'A streaking tail.' },
  { id: 'hearts', slot: 'trail', name: 'Hearts', price: 130, blurb: 'Spread the love.' },
  { id: 'fire', slot: 'trail', name: 'Flames', price: 170, blurb: 'Leave it all on fire.' }
]

export function cosmeticsBySlot(slot: CosmeticSlot): Cosmetic[] {
  return COSMETICS.filter((c) => c.slot === slot)
}
export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id)
}
