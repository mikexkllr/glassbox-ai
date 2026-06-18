import { useEffect, useMemo, useRef, useState } from 'react'
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

type GameId = 'order' | 'match' | 'blank' | 'bughunt' | 'predict'

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
  if (game === 'bughunt') return <BugHunt sections={sections} onBack={() => setGame(null)} />
  if (game === 'predict') return <PredictDiff sections={sections} onBack={() => setGame(null)} />

  const cards: { id: GameId; emoji: string; title: string; desc: string }[] = [
    { id: 'bughunt', emoji: '🐛', title: 'Bug Hunt', desc: 'One line was tampered with — spot the fake.' },
    { id: 'predict', emoji: '🔮', title: 'Predict the Diff', desc: 'Read a changed block — guess what it does.' },
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

function WinCard({
  reward,
  time,
  best,
  newBest,
  onAgain,
  onBack
}: {
  reward: number
  time?: number
  best?: number
  newBest?: boolean
  onAgain: () => void
  onBack: () => void
}) {
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
      <div className="text-[48px]">🎉</div>
      <div className="text-[18px] font-black text-glass-warm">+{reward}🪙</div>
      {time !== undefined && (
        <div className="mt-1 text-[12.5px] text-ink-500">
          ⏱ {(time / 1000).toFixed(1)}s
          {newBest ? (
            <span className="ml-1 font-bold text-glass-accent2">new best! 🏁</span>
          ) : best !== undefined ? (
            <span className="ml-1">· best {(best / 1000).toFixed(1)}s</span>
          ) : null}
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Bug Hunt — one line in a real block was subtly tampered with; spot it.
// ---------------------------------------------------------------------------

/** Subtly corrupt a line of code the way a sneaky regression would. Returns the
 * mutated line + a human description, or null if nothing safe to change. */
function mutateLine(line: string): { line: string; note: string } | null {
  const swaps: { re: RegExp; to: string; note: string }[] = [
    { re: /===/, to: '!==', note: 'flipped an equality check' },
    { re: /!==/, to: '===', note: 'flipped an equality check' },
    { re: />=/, to: '>', note: 'loosened a boundary (>=→>)' },
    { re: /<=/, to: '<', note: 'loosened a boundary (<=→<)' },
    { re: /&&/, to: '||', note: 'swapped && for ||' },
    { re: /\|\|/, to: '&&', note: 'swapped || for &&' },
    { re: /\btrue\b/, to: 'false', note: 'flipped a boolean' },
    { re: /\bfalse\b/, to: 'true', note: 'flipped a boolean' },
    { re: / \+ /, to: ' - ', note: 'changed + to -' },
    { re: / - /, to: ' + ', note: 'changed - to +' }
  ]
  const options: { line: string; note: string }[] = []
  for (const s of swaps) if (s.re.test(line)) options.push({ line: line.replace(s.re, s.to), note: s.note })
  const num = line.match(/\b(\d{1,4})\b/)
  if (num) {
    const n = parseInt(num[1], 10)
    const nn = Math.max(0, n + (Math.random() < 0.5 ? 1 : -1))
    if (nn !== n) options.push({ line: line.replace(num[0], String(nn)), note: 'introduced an off-by-one' })
  }
  const valid = options.filter((o) => o.line !== line)
  return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null
}

interface BugPuzzle {
  file: string
  startLine: number
  lines: string[] // shown to the player (one line mutated)
  original: string[] // pristine source
  badIndex: number
  note: string
  gist: string
}

function BugHunt({ sections, onBack }: { sections: WalkthroughSection[]; onBack: () => void }) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const unlock = useGame((s) => s.unlock)
  const recordTime = useGame((s) => s.recordTime)
  const sfxOn = useGame((s) => s.sfxOn)

  const [round, setRound] = useState(0)
  const [puzzle, setPuzzle] = useState<BugPuzzle | null | 'none'>(null)
  const [wrong, setWrong] = useState<Set<number>>(new Set())
  const [solved, setSolved] = useState(false)
  const [won, setWon] = useState(0)
  const [result, setResult] = useState<{ time: number; best?: number; newBest: boolean } | null>(null)
  const startRef = useRef(0)

  const chunks = useMemo(
    () => shuffle(sections.flatMap((s) => s.chunks)).filter((c) => c.endLine - c.startLine >= 2),
    [round, sections]
  )

  useEffect(() => {
    let alive = true
    setPuzzle(null)
    setWrong(new Set())
    setSolved(false)
    setResult(null)
    ;(async () => {
      if (!repoPath) {
        if (alive) setPuzzle('none')
        return
      }
      for (const c of chunks.slice(0, 14)) {
        try {
          const all = (await getFileText(repoPath, ref, c.file)).split('\n')
          const start = c.startLine
          const end = Math.min(c.endLine, start + 7)
          const block = all.slice(start - 1, end)
          const cands = block
            .map((l, i) => ({ i, l }))
            .filter((x) => x.l.trim().length > 0 && x.l.length < 130 && !/^\s*(\/\/|\*|\/\*)/.test(x.l))
            .map((x) => ({ i: x.i, m: mutateLine(x.l) }))
            .filter((x): x is { i: number; m: { line: string; note: string } } => !!x.m && x.m.line !== block[x.i])
          if (!cands.length) continue
          const pick = cands[Math.floor(Math.random() * cands.length)]
          const shown = block.slice()
          shown[pick.i] = pick.m.line
          if (alive) {
            startRef.current = performance.now()
            setPuzzle({ file: c.file, startLine: start, lines: shown, original: block, badIndex: pick.i, note: pick.m.note, gist: c.gist })
          }
          return
        } catch {
          // try the next chunk
        }
      }
      if (alive) setPuzzle('none')
    })()
    return () => {
      alive = false
    }
  }, [chunks, repoPath, ref])

  if (puzzle === 'none')
    return (
      <GameShell title="Bug Hunt" onBack={onBack}>
        <div className="py-8 text-center text-[13px] text-ink-600">
          Not enough mutatable code in the loaded sections yet. Open more sections and come back. 🐛
        </div>
      </GameShell>
    )

  if (won)
    return (
      <GameShell title="Bug Hunt" onBack={onBack}>
        <WinCard reward={won} time={result?.time} best={result?.best} newBest={result?.newBest} onAgain={() => { setRound((r) => r + 1); setWon(0) }} onBack={onBack} />
      </GameShell>
    )

  const click = (i: number, e: React.MouseEvent) => {
    if (!puzzle || solved) return
    if (i === puzzle.badIndex) {
      setSolved(true)
      if (sfxOn) play('correct')
      const clean = wrong.size === 0
      const got = award(clean ? 34 : 22, {
        x: e.clientX,
        y: e.clientY,
        reason: clean ? 'flawless catch! 🎯' : 'bug found!',
        sound: 'jackpot',
        confetti: true
      })
      if (clean) unlock('code_breaker')
      const time = performance.now() - startRef.current
      const prevBest = useGame.getState().bestTimes['bughunt']
      const isBest = recordTime('bughunt', time)
      setResult({ time, best: prevBest, newBest: isBest })
      setTimeout(() => setWon(got), 700)
    } else {
      setWrong((w) => new Set(w).add(i))
      breakCombo()
      if (sfxOn) play('wrong')
    }
  }

  return (
    <GameShell title="Bug Hunt" onBack={onBack}>
      {puzzle === null ? (
        <div className="py-8 text-center text-[12px] text-ink-600">planting a bug…</div>
      ) : (
        <>
          <p className="mb-1 text-[13px] text-gray-200">
            One line below was subtly <span className="font-semibold text-glass-del">tampered with</span>. Click the bug.
          </p>
          <p className="mb-3 truncate text-[11px] text-ink-600">
            Should: {puzzle.gist} · <span className="font-mono">{puzzle.file.split('/').pop()}</span>
          </p>
          <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-950 font-mono text-[12.5px]">
            {puzzle.lines.map((l, i) => {
              const isBad = solved && i === puzzle.badIndex
              const isWrong = wrong.has(i)
              return (
                <div key={i}>
                  <button
                    onClick={(e) => click(i, e)}
                    disabled={solved}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-0.5 text-left transition-colors',
                      isBad ? 'bg-glass-del/25' : isWrong ? 'bg-glass-warm/10' : 'hover:bg-glass-accent/10'
                    )}
                  >
                    <span className="select-none text-ink-600" style={{ minWidth: 30 }}>
                      {puzzle.startLine + i}
                    </span>
                    <span className="whitespace-pre-wrap text-gray-200">{l || ' '}</span>
                    {isWrong && !isBad && <span className="ml-auto whitespace-nowrap text-[10px] text-glass-warm">looks fine ✓</span>}
                  </button>
                  {isBad && (
                    <div className="flex items-start gap-3 border-t border-glass-add/30 bg-glass-add/10 px-3 py-0.5">
                      <span className="select-none text-glass-add/70" style={{ minWidth: 30 }}>real</span>
                      <span className="whitespace-pre-wrap text-glass-add">{puzzle.original[i] || ' '}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {solved && <p className="mt-3 text-center text-[12.5px] text-glass-add">🎯 Caught it — the fake {puzzle.note}.</p>}
        </>
      )}
    </GameShell>
  )
}

// ---------------------------------------------------------------------------
// Predict the Diff — read a real changed block, pick what it actually does.
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = { added: 'ADDED', modified: 'MODIFIED', removed: 'REMOVED' }
const KIND_CLR: Record<string, string> = { added: 'text-glass-add', modified: 'text-glass-accent', removed: 'text-glass-del' }

function PredictDiff({ sections, onBack }: { sections: WalkthroughSection[]; onBack: () => void }) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const award = useGame((s) => s.award)
  const breakCombo = useGame((s) => s.breakCombo)
  const recordTime = useGame((s) => s.recordTime)
  const sfxOn = useGame((s) => s.sfxOn)

  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [won, setWon] = useState(0)
  const [lines, setLines] = useState<string[] | null>(null)
  const [result, setResult] = useState<{ time: number; best?: number; newBest: boolean } | null>(null)
  const startRef = useRef(0)

  const chunks = useMemo(() => sections.flatMap((s) => s.chunks).filter((c) => c.gist && c.gist.length > 6), [sections])
  const allGists = useMemo(() => Array.from(new Set(chunks.map((c) => c.gist))), [chunks])

  const target = useMemo(() => (chunks.length ? shuffle(chunks)[0] : null), [round, chunks])
  const options = useMemo(() => {
    if (!target) return []
    const distract = shuffle(allGists.filter((g) => g !== target.gist)).slice(0, 3)
    return shuffle([target.gist, ...distract])
  }, [target])

  useEffect(() => {
    setPicked(null)
    setLines(null)
    setResult(null)
    if (target && repoPath)
      getFileText(repoPath, ref, target.file)
        .then((t) => {
          const all = t.split('\n')
          setLines(all.slice(target.startLine - 1, Math.min(target.endLine, target.startLine + 9)))
          startRef.current = performance.now()
        })
        .catch(() => setLines(['(could not load code)']))
  }, [target, repoPath, ref])

  if (chunks.length < 4 || allGists.length < 4)
    return (
      <GameShell title="Predict the Diff" onBack={onBack}>
        <div className="py-8 text-center text-[13px] text-ink-600">
          Open a few more sections first — this needs several code blocks to choose between. 🔮
        </div>
      </GameShell>
    )

  if (won)
    return (
      <GameShell title="Predict the Diff" onBack={onBack}>
        <WinCard reward={won} time={result?.time} best={result?.best} newBest={result?.newBest} onAgain={() => { setRound((r) => r + 1); setWon(0) }} onBack={onBack} />
      </GameShell>
    )

  const choose = (i: number, e: React.MouseEvent) => {
    if (picked !== null || !target) return
    setPicked(i)
    if (options[i] === target.gist) {
      const got = award(26, { x: e.clientX, y: e.clientY, reason: 'predicted! 🔮', sound: 'jackpot', confetti: true })
      const time = performance.now() - startRef.current
      const prevBest = useGame.getState().bestTimes['predict']
      const isBest = recordTime('predict', time)
      setResult({ time, best: prevBest, newBest: isBest })
      setTimeout(() => setWon(got), 700)
    } else {
      breakCombo()
      if (sfxOn) play('wrong')
    }
  }

  const wrongPick = picked !== null && !!target && options[picked] !== target.gist

  return (
    <GameShell title="Predict the Diff" onBack={onBack}>
      <p className="mb-1 text-[13px] text-gray-200">
        Read the changed block — <span className="font-semibold">what does it do?</span>
      </p>
      {target && (
        <div className="mb-2 flex items-center gap-2 text-[10.5px]">
          <span className={cn('font-bold uppercase tracking-wide', KIND_CLR[target.changeKind] ?? 'text-ink-600')}>
            {KIND_LABEL[target.changeKind] ?? 'CHANGED'}
          </span>
          <span className="font-mono text-ink-600">{target.file.split('/').pop()}:{target.startLine}</span>
        </div>
      )}
      {lines === null ? (
        <div className="py-3 text-[12px] text-ink-600">loading code…</div>
      ) : (
        <pre className="mb-3 max-h-[210px] overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[12px] leading-relaxed text-gray-200">
          {lines.join('\n')}
        </pre>
      )}
      <div className="space-y-2">
        {options.map((g, i) => {
          const reveal = picked !== null
          const isCorrect = !!target && g === target.gist
          const isPicked = picked === i
          return (
            <motion.button
              key={i}
              disabled={reveal}
              onClick={(e) => choose(i, e)}
              animate={reveal && isPicked && !isCorrect ? { x: [0, -6, 6, 0] } : {}}
              className={cn(
                'no-drag block w-full rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors',
                reveal && isCorrect
                  ? 'border-glass-add bg-glass-add/15 text-white'
                  : isPicked
                    ? 'border-glass-del bg-glass-del/15 text-white'
                    : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-accent/50'
              )}
            >
              {g}
            </motion.button>
          )
        })}
      </div>
      {wrongPick && (
        <div className="mt-3 text-right">
          <button
            onClick={() => setRound((r) => r + 1)}
            className="no-drag rounded-lg bg-glass-accent px-4 py-1.5 text-[12.5px] font-semibold text-ink-950 hover:brightness-110"
          >
            Next →
          </button>
        </div>
      )}
    </GameShell>
  )
}
