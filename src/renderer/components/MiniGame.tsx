import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WalkthroughSection } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { getFileText, cn } from '../lib/files'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const base = (p: string) => p.split('/').pop() ?? p

// ---------------------------------------------------------------------------
// Tumbler model — each is one tactile micro-puzzle, NOT multiple choice.
// ---------------------------------------------------------------------------
interface DialTumbler {
  kind: 'dial'
  name: string
  file: string
  line: number
  answer: string
  candidates: string[]
}
interface OrderTumbler {
  kind: 'order'
  name: string
  steps: { label: string; file: string; line: number }[] // already in correct order
}
interface WireTumbler {
  kind: 'wire'
  pairs: { symbol: string; gist: string }[]
}
type Tumbler = DialTumbler | OrderTumbler | WireTumbler

function buildTumblers(section: WalkthroughSection): Tumbler[] {
  const traces = section.traceableValues ?? []
  const out: Tumbler[] = []

  // 🎚️ Dial — predict a runtime value by rotating to it.
  const valSteps = traces.flatMap((v) =>
    v.steps.filter((s) => s.exampleValue).map((s) => ({ name: v.name, file: s.file, line: s.line, value: s.exampleValue! }))
  )
  const distinctVals = Array.from(new Set(valSteps.map((s) => s.value)))
  if (distinctVals.length >= 4) {
    for (const s of shuffle(valSteps).slice(0, 2)) {
      const others = shuffle(distinctVals.filter((v) => v !== s.value)).slice(0, 4)
      out.push({ kind: 'dial', name: s.name, file: s.file, line: s.line, answer: s.value, candidates: shuffle([s.value, ...others]) })
    }
  }

  // 🔩 Order — sequence the execution steps of a traced value.
  for (const v of traces.filter((t) => t.steps.length >= 3 && t.steps.length <= 6).slice(0, 2)) {
    out.push({
      kind: 'order',
      name: v.name,
      steps: v.steps.map((s) => ({ label: s.label, file: s.file, line: s.line }))
    })
  }

  // 🔌 Wire — connect symbols to what they do.
  const expl = section.inlineExplanations.filter((e) => e.gist)
  const seen = new Set<string>()
  const distinctExpl = expl.filter((e) => {
    const g = e.gist.toLowerCase()
    if (seen.has(g) || seen.has(e.symbol.toLowerCase())) return false
    seen.add(g)
    seen.add(e.symbol.toLowerCase())
    return true
  })
  if (distinctExpl.length >= 3) {
    const picked = shuffle(distinctExpl).slice(0, Math.min(4, distinctExpl.length))
    out.push({ kind: 'wire', pairs: picked.map((e) => ({ symbol: e.symbol, gist: e.gist })) })
  }

  // Variety first, then cap. Keep it short and punchy.
  return shuffle(out).slice(0, 4)
}

/** The locked-vault card + the "Decode" safe-cracking game it gates. Hidden coins inside. */
export default function SectionVault({ section, sectionId }: { section: WalkthroughSection; sectionId: string }) {
  const cracked = useGame((s) => !!s.rewarded[`vault:${sectionId}`])
  const [open, setOpen] = useState(false)

  const traces = section.traceableValues ?? []
  const hasOrder = traces.some((v) => v.steps.length >= 3 && v.steps.length <= 6)
  const distinctVals = new Set(traces.flatMap((v) => v.steps).filter((s) => s.exampleValue).map((s) => s.exampleValue)).size
  const hasWire = (section.inlineExplanations?.filter((e) => e.gist).length ?? 0) >= 3
  const playable = hasOrder || distinctVals >= 4 || hasWire
  if (!playable) return null

  return (
    <div
      className={cn(
        'rounded-xl border p-4 text-center',
        cracked ? 'border-glass-accent2/40 bg-glass-accent2/5' : 'border-glass-warm/40 bg-gradient-to-b from-glass-warm/10 to-transparent'
      )}
    >
      <div className="text-[30px]">{cracked ? '🔓' : '🔐'}</div>
      {cracked ? (
        <>
          <div className="text-[13px] font-bold text-glass-accent2">Vault cracked ✓</div>
          <button onClick={() => setOpen(true)} className="no-drag mt-1 text-[11px] text-ink-600 hover:text-white">
            replay for fun (no coins)
          </button>
        </>
      ) : (
        <>
          <div className="text-[14px] font-bold text-glass-warm">Hidden vault — coins inside 🪙</div>
          <p className="mt-0.5 text-[11.5px] text-ink-600">Crack the tumblers to prove you read the code.</p>
          <button
            onClick={() => setOpen(true)}
            className="no-drag mt-2 rounded-lg bg-gradient-to-r from-glass-warm to-glass-accent2 px-5 py-2 text-[13px] font-black text-ink-950 hover:scale-[1.02]"
          >
            🔐 Crack the vault
          </button>
        </>
      )}
      {open && <DecodeGame section={section} sectionId={sectionId} alreadyCracked={cracked} onClose={() => setOpen(false)} />}
    </div>
  )
}

function DecodeGame({
  section,
  sectionId,
  alreadyCracked,
  onClose
}: {
  section: WalkthroughSection
  sectionId: string
  alreadyCracked: boolean
  onClose: () => void
}) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const award = useGame((s) => s.award)
  const rewardOnce = useGame((s) => s.rewardOnce)
  const breakCombo = useGame((s) => s.breakCombo)
  const unlock = useGame((s) => s.unlock)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  const tumblers = useMemo(() => buildTumblers(section), [])

  // Load the real source lines referenced by dial/order tumblers.
  const [files, setFiles] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!repoPath) return
    const wanted = new Set<string>()
    for (const t of tumblers) {
      if (t.kind === 'dial') wanted.add(t.file)
      if (t.kind === 'order') t.steps.forEach((s) => wanted.add(s.file))
    }
    Promise.all(Array.from(wanted).map((f) => getFileText(repoPath, ref, f).then((txt) => [f, txt.split('\n')] as const))).then(
      (pairs) => setFiles(Object.fromEntries(pairs))
    )
  }, [])

  const [i, setI] = useState(0)
  const [misses, setMisses] = useState(0)
  const [done, setDone] = useState(false)
  const [payout, setPayout] = useState(0)

  const finish = () => {
    setDone(true)
    const perfect = misses === 0
    if (!alreadyCracked) {
      const reward = 50 + (perfect ? 30 : 0)
      const got = rewardOnce(`vault:${sectionId}`, reward, { reason: 'VAULT 🔓', sound: 'jackpot', confetti: true })
      setPayout(got)
      pushFx({ kind: 'jackpot' })
      unlock('code_breaker')
      if (perfect) unlock('flawless')
    }
  }

  const crack = (e?: React.MouseEvent) => {
    award(10, { x: e?.clientX, y: e?.clientY, reason: 'tumbler cracked 🔩', sound: 'chest' })
    if (i + 1 >= tumblers.length) setTimeout(finish, 500)
    else setTimeout(() => setI(i + 1), 500)
  }
  const miss = () => {
    setMisses((m) => m + 1)
    breakCombo()
    if (sfxOn) play('wrong')
  }

  const t = tumblers[i]

  return (
    <div data-overlay className="fixed inset-0 z-[160] flex items-center justify-center bg-ink-950/90 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-[640px] max-w-full rounded-2xl border border-glass-warm/40 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">🕵️ Crack the vault</h2>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <VaultDoor open />
            <div className="mt-2 text-[22px] font-black text-glass-warm">VAULT CRACKED!</div>
            <div className="mt-1 text-[14px] text-gray-300">
              {misses === 0 ? 'Flawless run 🎯 — ' : ''}
              {alreadyCracked ? 'already looted (no coins)' : `+${payout}🪙 hidden coins`}
            </div>
            <button
              onClick={onClose}
              className="no-drag mt-5 rounded-lg bg-glass-accent px-6 py-2 text-[14px] font-semibold text-ink-950 hover:brightness-110"
            >
              Claim &amp; close
            </button>
          </div>
        ) : (
          t && (
            <>
              <div className="mb-4 flex items-center justify-center gap-2">
                {tumblers.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      idx < i ? 'w-6 bg-glass-add' : idx === i ? 'w-8 bg-glass-warm' : 'w-2.5 bg-ink-700'
                    )}
                    title={idx < i ? 'cracked' : idx === i ? 'cracking…' : 'locked'}
                  />
                ))}
                <span className="ml-2 text-[11px] text-ink-600">misses: {misses}</span>
              </div>

              <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-glass-warm">
                Tumbler {i + 1}/{tumblers.length} · {KIND_LABEL[t.kind]}
              </div>

              {t.kind === 'dial' && <DialView key={i} t={t} line={files[t.file]?.[t.line - 1]} onCrack={crack} onMiss={miss} />}
              {t.kind === 'order' && <OrderView key={i} t={t} onCrack={crack} onMiss={miss} />}
              {t.kind === 'wire' && <WireView key={i} t={t} onCrack={crack} onMiss={miss} />}

              <p className="mt-4 text-center text-[11px] text-ink-600">crack every tumbler to open the vault · +10🪙 each</p>
            </>
          )
        )}
      </motion.div>
    </div>
  )
}

const KIND_LABEL: Record<Tumbler['kind'], string> = {
  dial: '🎚️ spin the dial',
  order: '🔩 align the sequence',
  wire: '🔌 rewire the panel'
}

// ---------------------------------------------------------------------------
// 🎚️ Dial — rotate to the predicted runtime value, then lock it in.
// ---------------------------------------------------------------------------
function DialView({ t, line, onCrack, onMiss }: { t: DialTumbler; line?: string; onCrack: (e?: React.MouseEvent) => void; onMiss: () => void }) {
  const sfxOn = useGame((s) => s.sfxOn)
  // Start off the answer so it's never pre-solved.
  const start = useMemo(() => {
    const ai = t.candidates.indexOf(t.answer)
    return (ai + 1 + Math.floor(Math.random() * (t.candidates.length - 1))) % t.candidates.length
  }, [t])
  const [idx, setIdx] = useState(start)
  const [locked, setLocked] = useState(false)
  const [shake, setShake] = useState(false)

  const n = t.candidates.length
  const rotate = (dir: number) => {
    if (locked) return
    setIdx((v) => (v + dir + n) % n)
    if (sfxOn) play('tick')
  }
  const lockIn = (e: React.MouseEvent) => {
    if (locked) return
    if (t.candidates[idx] === t.answer) {
      setLocked(true)
      onCrack(e)
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      onMiss()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-[14px] text-gray-200">
        After this line runs, dial in <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-glass-accent">{t.name}</code>
      </p>
      {line !== undefined && (
        <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[12.5px] text-gray-200">
          <span className="mr-3 select-none text-ink-600">{t.line}</span>
          {line}
        </pre>
      )}

      <motion.div animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} className="flex items-center justify-center gap-4">
        <button
          onClick={() => rotate(-1)}
          disabled={locked}
          className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-ink-700 bg-ink-850 text-[18px] text-gray-200 hover:border-glass-warm/60 disabled:opacity-40"
        >
          ◄
        </button>

        <div
          className={cn(
            'relative flex h-[120px] w-[300px] items-center justify-center overflow-hidden rounded-2xl border-4',
            locked ? 'border-glass-add bg-glass-add/10' : 'border-glass-warm/50 bg-ink-950'
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1 text-center text-[11px] tracking-widest text-ink-600">
            ▼ COMBINATION ▼
          </div>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={idx}
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -28, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn('max-w-[260px] truncate px-3 font-mono text-[22px] font-black', locked ? 'text-glass-add' : 'text-white')}
            >
              {t.candidates[idx]}
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] text-ink-700">
            {idx + 1} / {n}
          </div>
        </div>

        <button
          onClick={() => rotate(1)}
          disabled={locked}
          className="no-drag flex h-11 w-11 items-center justify-center rounded-full border border-ink-700 bg-ink-850 text-[18px] text-gray-200 hover:border-glass-warm/60 disabled:opacity-40"
        >
          ►
        </button>
      </motion.div>

      <div className="text-center">
        <button
          onClick={lockIn}
          disabled={locked}
          className="no-drag rounded-lg bg-gradient-to-r from-glass-warm to-glass-accent2 px-6 py-2 text-[13px] font-black text-ink-950 hover:scale-[1.02] disabled:opacity-50"
        >
          {locked ? '🔓 tumbler set' : '🔒 lock it in'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 🔩 Order — tap two steps to swap until they're in execution order.
// ---------------------------------------------------------------------------
function OrderView({ t, onCrack, onMiss }: { t: OrderTumbler; onCrack: (e?: React.MouseEvent) => void; onMiss: () => void }) {
  const sfxOn = useGame((s) => s.sfxOn)
  // Shuffle the indices, guaranteeing it isn't already sorted.
  const initial = useMemo(() => {
    const ids = t.steps.map((_, i) => i)
    let s = shuffle(ids)
    let guard = 0
    while (s.every((v, i) => v === i) && guard++ < 20) s = shuffle(ids)
    return s
  }, [t])

  const [order, setOrder] = useState(initial)
  const [sel, setSel] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [shake, setShake] = useState(false)

  const tap = (pos: number) => {
    if (locked) return
    if (sel === null) {
      setSel(pos)
      if (sfxOn) play('tick')
      return
    }
    if (sel === pos) {
      setSel(null)
      return
    }
    const next = [...order]
    ;[next[sel], next[pos]] = [next[pos], next[sel]]
    setOrder(next)
    setSel(null)
    if (sfxOn) play('tick')
  }

  const lockIn = (e: React.MouseEvent) => {
    if (locked) return
    if (order.every((v, i) => v === i)) {
      setLocked(true)
      onCrack(e)
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      onMiss()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-[14px] text-gray-200">
        Put the steps of <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-glass-accent">{t.name}</code> in execution
        order
      </p>

      <motion.div animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} className="space-y-2">
        {order.map((stepIdx, pos) => {
          const step = t.steps[stepIdx]
          const isSel = sel === pos
          const settled = locked
          return (
            <button
              key={stepIdx}
              onClick={() => tap(pos)}
              disabled={locked}
              className={cn(
                'no-drag flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                settled
                  ? 'border-glass-add/60 bg-glass-add/10'
                  : isSel
                    ? 'border-glass-warm bg-glass-warm/15'
                    : 'border-ink-700 bg-ink-850 hover:border-glass-warm/50'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-black',
                  settled ? 'bg-glass-add text-ink-950' : 'bg-ink-700 text-gray-300'
                )}
              >
                {pos + 1}
              </span>
              <span className="flex-1 text-[13px] text-gray-100">{step.label}</span>
              <span className="font-mono text-[10.5px] text-ink-600">
                {base(step.file)}:{step.line}
              </span>
            </button>
          )
        })}
      </motion.div>

      <div className="text-center">
        <button
          onClick={lockIn}
          disabled={locked}
          className="no-drag rounded-lg bg-gradient-to-r from-glass-warm to-glass-accent2 px-6 py-2 text-[13px] font-black text-ink-950 hover:scale-[1.02] disabled:opacity-50"
        >
          {locked ? '🔓 sequence aligned' : '🔒 lock the sequence'}
        </button>
        {sel !== null && <p className="mt-1 text-[11px] text-glass-warm">tap another step to swap</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 🔌 Wire — tap a symbol, then tap what it does, to connect them.
// ---------------------------------------------------------------------------
function WireView({ t, onCrack, onMiss }: { t: WireTumbler; onCrack: (e?: React.MouseEvent) => void; onMiss: () => void }) {
  const sfxOn = useGame((s) => s.sfxOn)
  const gistOrder = useMemo(() => shuffle(t.pairs.map((_, i) => i)), [t])
  const [selSym, setSelSym] = useState<number | null>(null)
  const [wrongGist, setWrongGist] = useState<number | null>(null)
  const [linked, setLinked] = useState<Record<number, true>>({}) // symbol index -> connected

  const tapSym = (i: number) => {
    if (linked[i]) return
    setSelSym(i)
    setWrongGist(null)
    if (sfxOn) play('tick')
  }
  const tapGist = (gi: number, e: React.MouseEvent) => {
    if (selSym === null || linked[selSym]) return
    if (gi === selSym) {
      const next = { ...linked, [selSym]: true as const }
      setLinked(next)
      setSelSym(null)
      if (Object.keys(next).length === t.pairs.length) onCrack(e)
      else if (sfxOn) play('correct')
    } else {
      setWrongGist(gi)
      setTimeout(() => setWrongGist(null), 400)
      onMiss()
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-[14px] text-gray-200">Connect each symbol to what it does</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {/* symbols */}
        <div className="space-y-2">
          {t.pairs.map((p, i) => (
            <button
              key={i}
              onClick={() => tapSym(i)}
              disabled={!!linked[i]}
              className={cn(
                'no-drag flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-[12.5px] font-bold transition-colors',
                linked[i]
                  ? 'border-glass-add/60 bg-glass-add/10 text-glass-add'
                  : selSym === i
                    ? 'border-glass-warm bg-glass-warm/15 text-white'
                    : 'border-ink-700 bg-ink-850 text-glass-accent hover:border-glass-warm/50'
              )}
            >
              <span>{linked[i] ? '🔗' : '🔌'}</span>
              {p.symbol}
            </button>
          ))}
        </div>
        {/* gists (shuffled) */}
        <div className="space-y-2">
          {gistOrder.map((gi) => {
            const isLinked = !!linked[gi]
            const isWrong = wrongGist === gi
            return (
              <motion.button
                key={gi}
                onClick={(e) => tapGist(gi, e)}
                disabled={isLinked || selSym === null}
                animate={isWrong ? { x: [0, -8, 8, -4, 4, 0] } : {}}
                className={cn(
                  'no-drag flex w-full items-center rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition-colors',
                  isLinked
                    ? 'border-glass-add/60 bg-glass-add/10 text-gray-300'
                    : isWrong
                      ? 'border-glass-del bg-glass-del/15 text-white'
                      : selSym === null
                        ? 'border-ink-800 bg-ink-850/50 text-ink-500'
                        : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-warm/50'
                )}
              >
                {isLinked && <span className="mr-2 text-glass-add">✓</span>}
                {t.pairs[gi].gist}
              </motion.button>
            )
          })}
        </div>
      </div>
      <p className="text-center text-[11px] text-ink-600">
        {selSym === null ? 'tap a symbol on the left' : 'now tap what it does →'}
      </p>
    </div>
  )
}

/** Decorative spinning safe dial shown on the win screen. */
function VaultDoor({ open }: { open: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.4, rotate: -30 }}
      animate={{ scale: 1, rotate: open ? 0 : -30 }}
      transition={{ type: 'spring', stiffness: 140, damping: 12 }}
      className="mx-auto text-[64px]"
    >
      🔓
    </motion.div>
  )
}
