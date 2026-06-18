import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useGame } from '../game/store'
import {
  SLOT_META,
  cosmeticsBySlot,
  confettiColors,
  coinGlyph,
  TRAIL_STYLES,
  type Cosmetic,
  type CosmeticSlot
} from '../game/cosmetics'
import { tokenize, type Line } from '../lib/highlight'
import { play, setPack } from '../game/sfx'
import { cn } from '../lib/files'

const SLOT_ORDER: CosmeticSlot[] = ['theme', 'confetti', 'coin', 'sound', 'trail']

/** The cosmetic shop — spend coins on things that visibly change the app. */
export default function Shop() {
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ink-600">
        Spend your coins on cosmetics — they change the real app, equip instantly, and stick around. Defaults
        are free. 🛍️
      </p>
      {SLOT_ORDER.map((slot) => (
        <ShopRow key={slot} slot={slot} />
      ))}
    </div>
  )
}

function ShopRow({ slot }: { slot: CosmeticSlot }) {
  const meta = SLOT_META[slot]
  const items = cosmeticsBySlot(slot)
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[14px] font-bold text-white">
          {meta.emoji} {meta.label}
        </span>
        <span className="text-[11px] text-ink-600">{meta.hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((c) => (
          <ShopItem key={c.id} c={c} />
        ))}
      </div>
    </div>
  )
}

function ShopItem({ c }: { c: Cosmetic }) {
  const coins = useGame((s) => s.coins)
  const equippedId = useGame((s) => s.equipped[c.slot])
  const owned = useGame((s) => c.price === 0 || s.owned.includes(c.id))
  const equippedSound = useGame((s) => s.equipped.sound)
  const buy = useGame((s) => s.buyCosmetic)
  const equip = useGame((s) => s.equipCosmetic)

  const isEquipped = equippedId === c.id
  const afford = coins >= c.price

  return (
    <motion.div
      whileHover={{ y: -1 }}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3',
        isEquipped ? 'border-glass-accent2/60 bg-glass-accent2/5' : 'border-ink-700 bg-ink-850/50'
      )}
    >
      <Preview c={c} equippedSound={equippedSound} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-white">{c.name}</div>
          <div className="truncate text-[10.5px] text-ink-600">{c.blurb}</div>
        </div>
      </div>

      {isEquipped ? (
        <span className="rounded-lg bg-glass-accent2/15 py-1.5 text-center text-[11.5px] font-bold text-glass-accent2">
          ✓ Equipped
        </span>
      ) : owned ? (
        <button
          onClick={() => equip(c.slot, c.id)}
          className="no-drag rounded-lg border border-ink-600 py-1.5 text-[11.5px] font-semibold text-gray-200 hover:border-glass-accent hover:text-white"
        >
          Equip
        </button>
      ) : (
        <button
          onClick={() => buy(c.id)}
          className={cn(
            'no-drag rounded-lg py-1.5 text-[11.5px] font-bold',
            afford
              ? 'bg-gradient-to-r from-glass-warm to-glass-accent2 text-ink-950 hover:scale-[1.02]'
              : 'cursor-not-allowed bg-ink-800 text-ink-600'
          )}
        >
          {afford ? `Buy · ${c.price}` : `${c.price}`} 🪙
        </button>
      )}
    </motion.div>
  )
}

function Preview({ c, equippedSound }: { c: Cosmetic; equippedSound: string }) {
  if (c.slot === 'theme') return <ThemePreview themeId={c.id} />
  if (c.slot === 'confetti') return <ConfettiPreview id={c.id} />
  if (c.slot === 'coin') return <GlyphPreview glyph={coinGlyph(c.id)} />
  if (c.slot === 'trail') return <TrailPreview id={c.id} />
  if (c.slot === 'sound') return <SoundPreview id={c.id} equippedSound={equippedSound} />
  return null
}

const SAMPLE = `const reward = combo * crit // 🪙\nfunction cashOut(coins: number) {\n  return coins > 0\n}`

function ThemePreview({ themeId }: { themeId: string }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  useEffect(() => {
    let alive = true
    tokenize(SAMPLE, 'typescript', themeId)
      .then((l) => alive && setLines(l))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [themeId])

  return (
    <pre className="code-surface h-[56px] overflow-hidden rounded-md border border-ink-700 bg-ink-950 p-2 text-[10px] leading-[1.5]">
      {lines ? (
        lines.map((toks, i) => (
          <div key={i} className="whitespace-pre">
            {toks.map((t, j) => (
              <span key={j} style={{ color: t.color }}>
                {t.content}
              </span>
            ))}
          </div>
        ))
      ) : (
        <span className="text-ink-600">…</span>
      )}
    </pre>
  )
}

function ConfettiPreview({ id }: { id: string }) {
  const colors = confettiColors(id)
  return (
    <div className="flex h-[56px] items-center justify-center gap-1.5 rounded-md border border-ink-700 bg-ink-950">
      {colors.map((col, i) => (
        <motion.span
          key={i}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12 }}
          className="h-3 w-3 rounded-sm"
          style={{ background: col }}
        />
      ))}
    </div>
  )
}

function GlyphPreview({ glyph }: { glyph: string }) {
  return (
    <div className="flex h-[56px] items-center justify-center rounded-md border border-ink-700 bg-ink-950 text-[30px]">
      {glyph}
    </div>
  )
}

function TrailPreview({ id }: { id: string }) {
  const style = TRAIL_STYLES[id]
  return (
    <div className="flex h-[56px] items-center justify-center gap-1 rounded-md border border-ink-700 bg-ink-950">
      {id === 'none' ? (
        <span className="text-[11px] text-ink-600">— none —</span>
      ) : style?.kind === 'emoji' ? (
        [0, 1, 2, 3].map((i) => (
          <span key={i} className="text-[18px]" style={{ opacity: 0.3 + i * 0.22 }}>
            {style.glyph}
          </span>
        ))
      ) : (
        [0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            style={{
              opacity: 0.3 + i * 0.22,
              background: (style?.colors ?? ['#7c9cff'])[i % (style?.colors?.length || 1)]
            }}
          />
        ))
      )}
    </div>
  )
}

function SoundPreview({ id, equippedSound }: { id: string; equippedSound: string }) {
  const sfxOn = useGame((s) => s.sfxOn)
  const sample = () => {
    if (!sfxOn) return
    setPack(id)
    play('coin')
    setTimeout(() => play('levelup'), 160)
    // Restore whatever's actually equipped so the preview doesn't change real audio.
    setTimeout(() => setPack(equippedSound), 700)
  }
  return (
    <button
      onClick={sample}
      title={sfxOn ? 'Hear it' : 'Sounds are muted'}
      className="no-drag flex h-[56px] items-center justify-center gap-2 rounded-md border border-ink-700 bg-ink-950 text-[13px] text-gray-200 hover:border-glass-accent2/60 hover:text-white"
    >
      <span className="text-[18px]">{sfxOn ? '▶' : '🔇'}</span> sample
    </button>
  )
}
