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

type GameId = 'order' | 'match' | 'blank'

/** A hub of interactive code-learning games, built from the loaded walkthrough. */
export default function GamesHub() {
  const sectionsMap = useStore((s) => s.sections)
  const sections = useMemo(() => Object.values(sectionsMap), [sectionsMap])
  const [game, setGame] = useState<GameId | null>(null)

  if (sections.length === 0)
    return (
      <div className="py-10 text-center text-[13px] text-ink-600">
        Open a section first — games are built from the code you're reviewing. 🎮
      </div>
    )

  if (game === 'order') return <OrderFlow sections={sections} onBack={() => setGame(null)} />
  if (game === 'match') return <MatchUp sections={sections} onBack={() => setGame(null)} />
  if (game === 'blank') return <FillBlank sections={sections} onBack={() => setGame(null)} />

  const cards: { id: GameId; emoji: string; title: string; desc: string }[] = [
    { id: 'order', emoji: '🔢', title: 'Order the Flow', desc: 'Click a value’s steps into execution order.' },
    { id: 'match', emoji: '🧩', title: 'Match Up', desc: 'Pair each symbol with what it does.' },
    { id: 'blank', emoji: '⌨️', title: 'Fill the Blank', desc: 'Type the missing identifier in real code.' }
  ]
  return (
    <div className="grid grid-cols-1 gap-2">
      {cards.map((c) => (
        <button
          key={c.id}
          onClick={() => setGame(c.id)}
          className="no-drag flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850/50 p-3 text-left hover:border-glass-accent/50"
        >
          <span className="text-[26px]">{c.emoji}</span>
          <span>
            <span className="block text-[13.5px] font-semibold text-white">{c.title}</span>
            <span className="block text-[11.5px] text-ink-600">{c.desc}</span>
          </span>
          <span className="ml-auto text-glass-accent">▸</span>
        </button>
      ))}
    </div>
  )
}

function GameShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="no-drag text-[12px] text-ink-600 hover:text-white">
          ← games
        </button>
        <span className="text-[13px] font-semibold text-white">{title}</span>
      </div>
      {children}
    </div>
  )
}

function WinCard({ reward, onAgain, onBack }: { reward: number; onAgain: () => void; onBack: () => void }) {
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
      <div className="text-[48px]">🎉</div>
      <div className="text-[18px] font-black text-glass-warm">+{reward}🪙</div>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={onAgain} className="no-drag rounded-lg bg-glass-accent px-4 py-2 text-[13px] font-semibold text-ink-950 hover:brightness-110">
          Play again
        </button>
        <button onClick={onBack} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] hover:border-ink-600">
          Back
        </button>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Order the Flow — click steps into execution order
// ---------------------------------------------------------------------------

function OrderFlow({ sections, onBack }: { sections: WalkthroughSection[]; onBack: () => void }) {
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)
  const [round, setRound] = useState(0)
  const [placed, setPlaced] = useState<number[]>([])
  const [wrong, setWrong] = useState<number | null>(null)
  const [won, setWon] = useState(0)

  const value = useMemo(() => {
    const vals = sections.flatMap((s) => s.traceableValues).filter((v) => v.steps.length >= 3 && v.steps.length <= 7)
    return vals.length ? shuffle(vals)[0] : null
  }, [round])
  const display = useMemo(() => (value ? shuffle(value.steps.map((_, i) => i)) : []), [value])

  if (!value)
    return (
      <GameShell title="Order the Flow" onBack={onBack}>
        <div className="py-8 text-center text-[13px] text-ink-600">No traceable value flows in the loaded sections yet. Try another game.</div>
      </GameShell>
    )

  if (won)
    return (
      <GameShell title="Order the Flow" onBack={onBack}>
        <WinCard reward={won} onAgain={() => { setRound((r) => r + 1); setPlaced([]); setWon(0) }} onBack={onBack} />
      </GameShell>
    )

  const click = (stepIdx: number, e: React.MouseEvent) => {
    if (placed.includes(stepIdx)) return
    const expected = placed.length // next correct step index is `placed.length` (steps are already in order)
    if (stepIdx === expected) {
      const next = [...placed, stepIdx]
      setPlaced(next)
      if (sfxOn) play('tick')
      if (next.length === value.steps.length) {
        const got = award(30, { x: e.clientX, y: e.clientY, reason: 'sequenced!', sound: 'jackpot', confetti: true })
        setTimeout(() => setWon(got), 400)
      }
    } else {
      setWrong(stepIdx)
      breakCombo()
      if (sfxOn) play('wrong')
      setTimeout(() => setWrong(null), 400)
    }
  }

  return (
    <GameShell title="Order the Flow" onBack={onBack}>
      <p className="mb-1 text-[13px] text-gray-200">
        Click the steps of <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-glass-accent2">{value.name}</code> in the order they run.
      </p>
      <p className="mb-3 text-[11px] text-ink-600">{placed.length}/{value.steps.length} placed</p>
      <div className="space-y-2">
        {display.map((stepIdx) => {
          const s = value.steps[stepIdx]
          const pos = placed.indexOf(stepIdx)
          const done = pos >= 0
          return (
            <motion.button
              key={stepIdx}
              onClick={(e) => click(stepIdx, e)}
              disabled={done}
              animate={wrong === stepIdx ? { x: [0, -8, 8, -4, 4, 0] } : {}}
              className={cn(
                'no-drag flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13px]',
                done ? 'border-glass-add bg-glass-add/15 text-white' : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent2/50'
              )}
            >
              <span className={cn('flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold', done ? 'bg-glass-add text-ink-950' : 'bg-ink-700 text-ink-400')}>
                {done ? pos + 1 : '?'}
              </span>
              <span className="min-w-0 flex-1">
                {s.label}
                <span className="ml-1 font-mono text-[10px] text-ink-600">{s.file.split('/').pop()}:{s.line}</span>
              </span>
            </motion.button>
          )
        })}
      </div>
    </GameShell>
  )
}

// ---------------------------------------------------------------------------
// Match Up — pair symbol with its meaning
// ---------------------------------------------------------------------------

function MatchUp({ sections, onBack }: { sections: WalkthroughSection[]; onBack: () => void }) {
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)
  const [round, setRound] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [wrongR, setWrongR] = useState<number | null>(null)
  const [won, setWon] = useState(0)

  const pairs = useMemo(() => {
    const all = sections.flatMap((s) => s.inlineExplanations).filter((e) => e.gist)
    // dedupe by symbol
    const seen = new Set<string>()
    const uniq = all.filter((e) => (seen.has(e.symbol) ? false : (seen.add(e.symbol), true)))
    return shuffle(uniq).slice(0, 5)
  }, [round])
  const right = useMemo(() => shuffle(pairs.map((_, i) => i)), [pairs])

  if (pairs.length < 3)
    return (
      <GameShell title="Match Up" onBack={onBack}>
        <div className="py-8 text-center text-[13px] text-ink-600">Not enough symbols in the loaded sections yet.</div>
      </GameShell>
    )

  if (won)
    return (
      <GameShell title="Match Up" onBack={onBack}>
        <WinCard reward={won} onAgain={() => { setRound((r) => r + 1); setMatched(new Set()); setSel(null); setWon(0) }} onBack={onBack} />
      </GameShell>
    )

  const pickRight = (rIdx: number, e: React.MouseEvent) => {
    if (sel === null) return
    const leftSym = pairs[sel].symbol
    const rightSym = pairs[rIdx].symbol
    if (leftSym === rightSym) {
      const next = new Set(matched).add(leftSym)
      setMatched(next)
      setSel(null)
      if (sfxOn) play('correct')
      if (next.size === pairs.length) {
        const got = award(30, { x: e.clientX, y: e.clientY, reason: 'matched!', sound: 'jackpot', confetti: true })
        setTimeout(() => setWon(got), 400)
      }
    } else {
      setWrongR(rIdx)
      breakCombo()
      if (sfxOn) play('wrong')
      setTimeout(() => { setWrongR(null); setSel(null) }, 450)
    }
  }

  return (
    <GameShell title="Match Up" onBack={onBack}>
      <p className="mb-3 text-[12px] text-ink-600">Tap a symbol, then tap what it does. {matched.size}/{pairs.length} matched</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {pairs.map((p, i) => {
            const done = matched.has(p.symbol)
            return (
              <button
                key={i}
                disabled={done}
                onClick={() => setSel(i)}
                className={cn(
                  'no-drag block w-full truncate rounded-lg border px-3 py-2 text-left font-mono text-[12.5px]',
                  done ? 'border-glass-add bg-glass-add/15 text-glass-add' : sel === i ? 'border-glass-accent bg-glass-accent/15 text-white' : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent/50'
                )}
              >
                {p.symbol}
              </button>
            )
          })}
        </div>
        <div className="space-y-2">
          {right.map((pi, j) => {
            const p = pairs[pi]
            const done = matched.has(p.symbol)
            return (
              <motion.button
                key={j}
                disabled={done}
                onClick={(e) => pickRight(pi, e)}
                animate={wrongR === pi ? { x: [0, -6, 6, 0] } : {}}
                className={cn(
                  'no-drag block w-full rounded-lg border px-3 py-2 text-left text-[12px] leading-snug',
                  done ? 'border-glass-add bg-glass-add/15 text-glass-add' : 'border-ink-700 bg-ink-850 text-gray-300 hover:border-glass-accent2/50'
                )}
              >
                {p.gist}
              </motion.button>
            )
          })}
        </div>
      </div>
    </GameShell>
  )
}

// ---------------------------------------------------------------------------
// Fill the Blank — type the missing identifier
// ---------------------------------------------------------------------------

function FillBlank({ sections, onBack }: { sections: WalkthroughSection[]; onBack: () => void }) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const sfxOn = useGame((s) => s.sfxOn)
  const [round, setRound] = useState(0)
  const [guess, setGuess] = useState('')
  const [status, setStatus] = useState<'idle' | 'wrong'>('idle')
  const [reveal, setReveal] = useState(false)
  const [won, setWon] = useState(0)
  const [lines, setLines] = useState<string[] | null>(null)

  const target = useMemo(() => {
    const all = sections.flatMap((s) => s.inlineExplanations).filter((e) => e.gist && e.symbol.length >= 2)
    return all.length ? shuffle(all)[0] : null
  }, [round])

  useEffect(() => {
    setGuess('')
    setStatus('idle')
    setReveal(false)
    setLines(null)
    if (target && repoPath) getFileText(repoPath, ref, target.file).then((t) => setLines(t.split('\n')))
  }, [target, repoPath])

  if (!target)
    return (
      <GameShell title="Fill the Blank" onBack={onBack}>
        <div className="py-8 text-center text-[13px] text-ink-600">No symbols available in the loaded sections yet.</div>
      </GameShell>
    )

  if (won)
    return (
      <GameShell title="Fill the Blank" onBack={onBack}>
        <WinCard reward={won} onAgain={() => { setRound((r) => r + 1); setWon(0) }} onBack={onBack} />
      </GameShell>
    )

  const raw = lines?.[target.line - 1] ?? ''
  const blanked = raw.replace(target.symbol, '▢▢▢')

  const submit = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (guess.trim().toLowerCase() === target.symbol.toLowerCase()) {
      const got = award(22, {
        x: 'clientX' in e ? (e as React.MouseEvent).clientX : undefined,
        y: 'clientY' in e ? (e as React.MouseEvent).clientY : undefined,
        reason: 'decoded!',
        sound: 'jackpot',
        confetti: true
      })
      setTimeout(() => setWon(got), 350)
    } else {
      setStatus('wrong')
      breakCombo()
      if (sfxOn) play('wrong')
    }
  }

  return (
    <GameShell title="Fill the Blank" onBack={onBack}>
      <p className="mb-1 text-[12px] text-ink-600">
        Hint ({target.kind}): {target.gist}
      </p>
      <div className="mb-3 font-mono text-[10.5px] text-ink-600">{target.file}:{target.line}</div>
      {lines === null ? (
        <div className="py-3 text-[12px] text-ink-600">loading code…</div>
      ) : (
        <pre className="mb-3 overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[13px] text-gray-200">
          {reveal ? raw : blanked}
        </pre>
      )}
      <div className="flex gap-2">
        <input
          value={guess}
          onChange={(e) => { setGuess(e.target.value); setStatus('idle') }}
          onKeyDown={(e) => e.key === 'Enter' && submit(e)}
          placeholder="type the missing identifier…"
          autoFocus
          className={cn('input no-drag flex-1 font-mono', status === 'wrong' && 'border-glass-del')}
        />
        <button onClick={submit} className="no-drag rounded-lg bg-glass-accent px-4 text-[13px] font-semibold text-ink-950 hover:brightness-110">
          Check
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {status === 'wrong' && <span className="text-glass-del">Not it — try again</span>}
        <button onClick={() => setReveal((r) => !r)} className="no-drag ml-auto text-ink-600 hover:text-white">
          {reveal ? 'hide' : 'peek (no coins)'}
        </button>
      </div>
    </GameShell>
  )
}
