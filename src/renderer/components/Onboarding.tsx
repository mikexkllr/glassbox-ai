import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { useGame, rankTitle } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

export default function Onboarding() {
  const repoPath = useStore((s) => s.repoPath)
  const branches = useStore((s) => s.branches)
  const base = useStore((s) => s.base)
  const feature = useStore((s) => s.feature)
  const busy = useStore((s) => s.busyDiff)
  const error = useStore((s) => s.error)
  const settings = useStore((s) => s.settings)

  const pickRepo = useStore((s) => s.pickRepo)
  const setBase = useStore((s) => s.setBase)
  const setFeature = useStore((s) => s.setFeature)
  const start = useStore((s) => s.startWalkthrough)
  const openSettings = useStore((s) => s.openSettings)

  const coins = useGame((s) => s.coins)
  const xp = useGame((s) => s.xp)
  const streak = useGame((s) => s.streak)
  const sfxOn = useGame((s) => s.sfxOn)
  const level = Math.floor(xp / 400) + 1

  const repoName = repoPath?.split('/').pop()
  const ready = !!repoPath && !!base && !!feature && !busy
  const returning = xp > 0 || coins > 0

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <AuroraBg />
      <FloatingEmoji />

      <div className="drag h-10 w-full flex-none" />

      <div className="relative z-10 flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-xl">
          {/* ── hero ───────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="mb-7 text-center"
          >
            <Logo />

            <h1 className="mt-3 text-[40px] font-black leading-none tracking-tight">
              <span className="gb-hue bg-gradient-to-r from-glass-accent via-glass-accent2 to-glass-warm bg-clip-text text-transparent">
                GLASSBOX
              </span>
            </h1>
            <p className="mt-2 text-[14.5px] font-medium leading-relaxed text-gray-300">
              don't read the diff like a caveman 🗿
              <br />
              <span className="text-glass-accent2">turn the PR into a game</span> &amp; actually <span className="text-glass-warm">get it</span> 🧠✨
            </p>

            {returning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className="mx-auto mt-4 flex w-fit items-center gap-3 rounded-full border border-glass-warm/30 bg-ink-900/70 px-4 py-1.5 backdrop-blur"
              >
                <Stat emoji="🏅" label={`Lv.${level}`} sub={rankTitle(level)} />
                <span className="h-4 w-px bg-ink-700" />
                <Stat emoji="🪙" label={coins.toLocaleString()} sub="coins" />
                {streak > 0 && (
                  <>
                    <span className="h-4 w-px bg-ink-700" />
                    <Stat emoji="🔥" label={`${streak}d`} sub="streak" />
                  </>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* ── setup card ─────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-ink-700/80 bg-ink-850/60 p-5 shadow-2xl shadow-glass-accent/5 backdrop-blur-xl"
          >
            <Step n={1} label="drop a repo 📁">
              <button
                onClick={() => {
                  if (sfxOn) play('whoosh')
                  pickRepo()
                }}
                className={cn(
                  'no-drag w-full rounded-xl border border-dashed px-4 py-3.5 text-left text-[14px] transition-all',
                  repoPath
                    ? 'border-glass-accent2/50 bg-glass-accent2/5'
                    : 'border-ink-600 bg-ink-900/60 hover:border-glass-accent/60 hover:bg-glass-accent/5'
                )}
              >
                {repoPath ? (
                  <span className="text-gray-100">
                    ✅ <span className="font-semibold">{repoName}</span>{' '}
                    <span className="text-ink-600">— {repoPath}</span>
                  </span>
                ) : (
                  <span className="text-ink-600">tap to pick a local git repo… we cook from here 👨‍🍳</span>
                )}
              </button>
            </Step>

            {branches.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <Step n={2} label="pick the matchup ⚔️">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <select value={base} onChange={(e) => setBase(e.target.value)} className="select no-drag">
                      {branches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <span className="text-[16px]">🆚</span>
                    <select value={feature} onChange={(e) => setFeature(e.target.value)} className="select no-drag">
                      {branches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-600">base (what you got) → feature (the new sauce)</p>
                </Step>
              </motion.div>
            )}

            {error && (
              <div className="mb-3 rounded-lg bg-glass-del/15 px-3 py-2 text-[12.5px] text-glass-del">💀 {error}</div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <motion.button
                onClick={() => {
                  if (sfxOn) play('levelup')
                  start()
                }}
                disabled={!ready}
                whileHover={ready ? { scale: 1.02 } : {}}
                whileTap={ready ? { scale: 0.98 } : {}}
                className={cn(
                  'no-drag relative flex-1 overflow-hidden rounded-xl px-5 py-3.5 text-[15px] font-black transition-all',
                  ready
                    ? 'gb-bob bg-gradient-to-r from-glass-accent via-glass-accent2 to-glass-warm text-ink-950 shadow-lg shadow-glass-accent/30'
                    : 'cursor-not-allowed bg-ink-800 text-ink-600'
                )}
              >
                {ready && (
                  <span className="pointer-events-none absolute inset-0 -skew-x-12">
                    <span className="gb-shimmer absolute inset-y-0 left-0 w-1/3 bg-white/30 blur-md" />
                  </span>
                )}
                <span className="relative">
                  {busy ? 'cooking the diff… 🍳' : ready ? "let's gooo 🚀" : 'pick a repo first 👆'}
                </span>
              </motion.button>
              <button
                onClick={() => openSettings(true)}
                className="no-drag rounded-xl border border-ink-700 px-4 py-3.5 text-[13px] text-gray-300 transition-colors hover:border-glass-accent/50 hover:text-white"
              >
                ⚙ {settings?.provider ?? 'Settings'}
              </button>
            </div>
          </motion.div>

          <PerkRow />
        </div>
      </div>

      <Ticker />
    </div>
  )
}

/* ── animated prism logo ─────────────────────────────────────── */
function Logo() {
  return (
    <div className="relative mx-auto h-[88px] w-[88px]">
      <div className="gb-glow absolute inset-0 rounded-[28px] bg-gradient-to-br from-glass-accent via-glass-accent2 to-glass-warm blur-xl" />
      <motion.div
        whileHover={{ rotate: 8, scale: 1.05 }}
        className="relative grid h-full w-full place-items-center rounded-[26px] border border-white/10 bg-ink-900/80 backdrop-blur"
      >
        <svg viewBox="0 0 100 100" className="h-[58px] w-[58px]">
          <defs>
            <linearGradient id="gbprism" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c9cff" />
              <stop offset="50%" stopColor="#5ee0c0" />
              <stop offset="100%" stopColor="#ffb86b" />
            </linearGradient>
          </defs>
          {/* incoming beam */}
          <line x1="2" y1="50" x2="38" y2="50" stroke="#e6e9ef" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          {/* glass cube */}
          <g className="gb-spin" style={{ transformOrigin: '50px 50px' }}>
            <polygon points="50,18 80,35 80,68 50,85 20,68 20,35" fill="url(#gbprism)" opacity="0.18" />
            <polygon
              points="50,18 80,35 80,68 50,85 20,68 20,35"
              fill="none"
              stroke="url(#gbprism)"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <line x1="50" y1="18" x2="50" y2="85" stroke="url(#gbprism)" strokeWidth="1.5" opacity="0.6" />
            <line x1="20" y1="35" x2="80" y2="68" stroke="url(#gbprism)" strokeWidth="1.5" opacity="0.5" />
            <line x1="80" y1="35" x2="20" y2="68" stroke="url(#gbprism)" strokeWidth="1.5" opacity="0.5" />
          </g>
          {/* split rainbow output */}
          <line x1="64" y1="48" x2="98" y2="40" stroke="#7c9cff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="64" y1="52" x2="98" y2="52" stroke="#5ee0c0" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="64" y1="56" x2="98" y2="64" stroke="#ffb86b" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </motion.div>
    </div>
  )
}

function Stat({ emoji, label, sub }: { emoji: string; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[15px]">{emoji}</span>
      <span className="text-[13px] font-bold text-white">{label}</span>
      <span className="text-[11px] text-ink-600">{sub}</span>
    </div>
  )
}

const PERKS = [
  { emoji: '🪙', text: 'earn coins' },
  { emoji: '🎰', text: 'crack vaults' },
  { emoji: '🔥', text: 'build combos' },
  { emoji: '🧠', text: 'big brain' }
]

function PerkRow() {
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      {PERKS.map((p, i) => (
        <motion.div
          key={p.text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + i * 0.07 }}
          className="flex items-center gap-1.5 rounded-full border border-ink-700/70 bg-ink-900/50 px-3 py-1 text-[11.5px] text-gray-300 backdrop-blur"
        >
          <span>{p.emoji}</span>
          {p.text}
        </motion.div>
      ))}
    </div>
  )
}

function AuroraBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="gb-aurora absolute -left-32 -top-32 h-96 w-96 rounded-full bg-glass-accent/40" />
      <div className="gb-aurora absolute -right-24 top-10 h-80 w-80 rounded-full bg-glass-accent2/30" style={{ animationDelay: '-5s' }} />
      <div className="gb-aurora absolute bottom-[-6rem] left-1/3 h-96 w-96 rounded-full bg-glass-warm/25" style={{ animationDelay: '-9s' }} />
    </div>
  )
}

const EMOJIS = ['🪙', '✨', '🧠', '🔥', '💎', '🚀', '🎰', '⚡️', '🪙', '💯']

function FloatingEmoji() {
  const items = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        emoji: EMOJIS[i % EMOJIS.length],
        left: Math.random() * 100,
        delay: Math.random() * 12,
        dur: 9 + Math.random() * 9,
        size: 14 + Math.random() * 20
      })),
    []
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it, i) => (
        <span
          key={i}
          className="gb-float absolute bottom-0 select-none opacity-0"
          style={{
            left: `${it.left}%`,
            fontSize: `${it.size}px`,
            animationDelay: `${it.delay}s`,
            animationDuration: `${it.dur}s`
          }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  )
}

function Ticker() {
  const phrase = 'NO CAP CODE REVIEW 💯  ·  TOUCH GRASS LATER 🌱  ·  UNDERSTAND THE VIBES 🧠  ·  COINS = DOPAMINE 🪙  ·  GLASSBOX MAXXING 🚀  ·  '
  return (
    <div className="relative z-10 flex-none overflow-hidden border-t border-ink-800/60 bg-ink-900/40 py-1.5 backdrop-blur">
      <div className="flex w-max gb-marquee whitespace-nowrap text-[11px] font-bold tracking-widest text-ink-600">
        <span>{phrase.repeat(2)}</span>
        <span>{phrase.repeat(2)}</span>
      </div>
    </div>
  )
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-glass-accent to-glass-accent2 text-[11px] font-bold text-ink-950">
          {n}
        </span>
        <span className="text-[12.5px] font-semibold text-gray-200">{label}</span>
      </div>
      {children}
    </div>
  )
}
