import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import { useGame, rankTitle, XP_PER_LEVEL } from '../game/store'
import { cn } from '../lib/files'

interface StatSlide {
  kind: 'stat'
  emoji: string
  value: string
  label: string
  sub?: string
  accent: string
}
type Slide = StatSlide | { kind: 'finale' }

/** A Spotify-Wrapped-style cinematic recap shown on the way to cashing out —
 * built entirely from stats already tracked in the game + walkthrough stores. */
export default function PRWrapped({ onProceed, onClose }: { onProceed: () => void; onClose: () => void }) {
  const g = useGame()
  const pushFx = useGame((s) => s.pushFx)
  const diff = useStore((s) => s.diff)
  const overview = useStore((s) => s.overview)
  const walked = useStore((s) => s.walked)

  const slides = useMemo<Slide[]>(() => {
    const level = Math.floor(g.xp / XP_PER_LEVEL) + 1
    const totalSections = overview?.sections.length ?? 0
    const explored = g.countPrefix('section:open:')
    const vaults = g.countPrefix('vault:')
    const quizzes = g.countPrefix('quizsolved:')
    const insights = g.countPrefix('insight:')

    // Biggest blind spot: the highest-churn changed file in no walked section.
    let blindSpot: { name: string; churn: number } | null = null
    if (diff) {
      const walkedSet = new Set(walked)
      const mapped = new Set<string>()
      for (const sec of overview?.sections ?? []) if (walkedSet.has(sec.id)) sec.files.forEach((f) => mapped.add(f))
      for (const f of diff.files) {
        const churn = f.additions + f.deletions
        if (!mapped.has(f.path) && (!blindSpot || churn > blindSpot.churn))
          blindSpot = { name: f.path.split('/').pop() ?? f.path, churn }
      }
    }

    const out: Slide[] = [
      { kind: 'stat', emoji: '📼', value: 'Your PR, Wrapped', label: "here's what you cracked", accent: '#7c9cff' },
      { kind: 'stat', emoji: '🪙', value: g.lifetimeCoins.toLocaleString(), label: 'coins earned, all-time', accent: '#ffb86b' },
      { kind: 'stat', emoji: '🎚️', value: `LVL ${level}`, label: rankTitle(level), accent: '#5ee0c0' }
    ]
    if (g.bestCombo >= 2)
      out.push({ kind: 'stat', emoji: '🔥', value: `${g.bestCombo}×`, label: 'your peak combo', accent: '#ff5db1' })
    if (totalSections)
      out.push({
        kind: 'stat',
        emoji: '📂',
        value: `${Math.min(explored, totalSections)}/${totalSections}`,
        label: 'sections explored',
        accent: '#7c9cff'
      })
    if (vaults) out.push({ kind: 'stat', emoji: '🔐', value: `${vaults}`, label: vaults === 1 ? 'vault cracked' : 'vaults cracked', accent: '#ffb86b' })
    if (quizzes) out.push({ kind: 'stat', emoji: '🧠', value: `${quizzes}`, label: 'quizzes aced', accent: '#5ee0c0' })
    if (insights) out.push({ kind: 'stat', emoji: '💡', value: `${insights}`, label: 'insights revealed', accent: '#ffd23f' })
    if (blindSpot)
      out.push({
        kind: 'stat',
        emoji: '🕳️',
        value: blindSpot.name,
        label: 'your biggest blind spot',
        sub: `${blindSpot.churn} changed lines you never opened`,
        accent: '#f85149'
      })
    else if (totalSections)
      out.push({ kind: 'stat', emoji: '🧹', value: 'Clean sweep', label: 'you opened every changed file', accent: '#2ea043' })
    out.push({ kind: 'finale' })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [i, setI] = useState(0)
  const slide = slides[i]
  const isLast = slide.kind === 'finale'

  useEffect(() => {
    pushFx({ kind: 'confetti' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (isLast) pushFx({ kind: 'confetti' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLast])

  return (
    <div data-overlay className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-[440px] max-w-full overflow-hidden rounded-3xl border border-glass-accent/40 bg-gradient-to-b from-ink-850 to-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="no-drag absolute right-4 top-3 z-10 text-ink-600 hover:text-white">
          ✕
        </button>

        <div className="flex min-h-[360px] flex-col items-center justify-center px-8 py-10 text-center">
          <AnimatePresence mode="wait">
            {slide.kind === 'stat' ? (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.7, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.1, y: -20 }}
                transition={{ duration: 0.35, ease: 'backOut' }}
                className="flex flex-col items-center"
              >
                <div className="text-[64px]">{slide.emoji}</div>
                <div className="mt-2 text-[40px] font-black leading-tight" style={{ color: slide.accent }}>
                  {slide.value}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-white">{slide.label}</div>
                {slide.sub && <div className="mt-1 text-[12px] text-ink-600">{slide.sub}</div>}
              </motion.div>
            ) : (
              <motion.div
                key="finale"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center"
              >
                <div className="text-[64px]">🚀</div>
                <div className="mt-2 text-[26px] font-black text-white">Ready to ship?</div>
                <p className="mt-1 max-w-[260px] text-[12.5px] text-ink-600">
                  You did the reading. Time to spend those coins and mint your verdict.
                </p>
                <button
                  onClick={onProceed}
                  className="no-drag mt-5 rounded-xl bg-gradient-to-r from-glass-warm to-glass-accent2 px-7 py-3 text-[15px] font-black text-ink-950 transition-transform hover:scale-[1.03]"
                >
                  🎰 Mint your verdict
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* progress dots + nav */}
        <div className="flex items-center justify-between border-t border-ink-800 px-5 py-3">
          <button
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className="no-drag text-[12px] text-ink-600 hover:text-white disabled:opacity-30"
          >
            ← back
          </button>
          <div className="flex gap-1.5">
            {slides.map((_, n) => (
              <span
                key={n}
                className={cn('h-1.5 rounded-full transition-all', n === i ? 'w-5 bg-glass-accent' : 'w-1.5 bg-ink-700')}
              />
            ))}
          </div>
          {isLast ? (
            <span className="w-12" />
          ) : (
            <button
              onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))}
              className="no-drag rounded-lg bg-glass-accent px-3 py-1 text-[12px] font-bold text-ink-950 hover:brightness-110"
            >
              next →
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
