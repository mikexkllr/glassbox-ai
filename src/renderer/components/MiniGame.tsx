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

interface Round {
  kind: 'meaning' | 'predict'
  label: string
  file: string
  line: number
  options: string[]
  correct: number
}

/** The locked-vault card + the "Decode" mini-game it gates. Hidden coins inside. */
export default function SectionVault({ section, sectionId }: { section: WalkthroughSection; sectionId: string }) {
  const cracked = useGame((s) => !!s.rewarded[`vault:${sectionId}`])
  const [open, setOpen] = useState(false)

  // Need at least 2 explanations to make a real quiz.
  const playable = (section.inlineExplanations?.filter((e) => e.gist).length ?? 0) >= 2
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
          <p className="mt-0.5 text-[11.5px] text-ink-600">Prove you understand the code to crack it open.</p>
          <button
            onClick={() => setOpen(true)}
            className="no-drag mt-2 rounded-lg bg-gradient-to-r from-glass-warm to-glass-accent2 px-5 py-2 text-[13px] font-black text-ink-950 hover:scale-[1.02]"
          >
            🎮 Play “Decode”
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

  const rounds = useMemo<Round[]>(() => {
    // "What does this do?" rounds from inline explanations.
    const expl = section.inlineExplanations.filter((e) => e.gist)
    const meaningDistractors = [...expl.map((e) => e.gist), ...section.chunks.map((c) => c.story.what)].filter(Boolean)
    const meaning: Round[] = shuffle(expl)
      .slice(0, 4)
      .map((e) => {
        const others = shuffle(meaningDistractors.filter((g) => g !== e.gist)).slice(0, 3)
        const options = shuffle([e.gist, ...others])
        return { kind: 'meaning', label: e.symbol, file: e.file, line: e.line, options, correct: options.indexOf(e.gist) }
      })

    // "Predict the value" rounds from traceable values with concrete example values.
    const allValues = (section.traceableValues ?? []).flatMap((v) =>
      v.steps.filter((s) => s.exampleValue).map((s) => ({ name: v.name, file: s.file, line: s.line, value: s.exampleValue! }))
    )
    const distinctVals = Array.from(new Set(allValues.map((a) => a.value)))
    const predict: Round[] =
      distinctVals.length >= 3
        ? shuffle(allValues)
            .slice(0, 2)
            .map((a) => {
              const others = shuffle(distinctVals.filter((v) => v !== a.value)).slice(0, 3)
              const options = shuffle([a.value, ...others])
              return { kind: 'predict', label: a.name, file: a.file, line: a.line, options, correct: options.indexOf(a.value) }
            })
        : []

    return shuffle([...meaning, ...predict]).slice(0, 6)
  }, [])

  const [files, setFiles] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!repoPath) return
    const distinct = Array.from(new Set(rounds.map((r) => r.file)))
    Promise.all(distinct.map((f) => getFileText(repoPath, ref, f).then((t) => [f, t.split('\n')] as const))).then((pairs) =>
      setFiles(Object.fromEntries(pairs))
    )
  }, [])

  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [misses, setMisses] = useState(0)
  const [done, setDone] = useState(false)
  const [payout, setPayout] = useState(0)

  const r = rounds[i]
  const line = r ? files[r.file]?.[r.line - 1] : undefined

  const finish = () => {
    setDone(true)
    const perfect = misses === 0
    if (!alreadyCracked) {
      const base = 50 + (perfect ? 30 : 0)
      const got = rewardOnce(`vault:${sectionId}`, base, { reason: 'VAULT 🔓', sound: 'jackpot', confetti: true })
      setPayout(got)
      pushFx({ kind: 'jackpot' })
      unlock('code_breaker')
      if (perfect) unlock('flawless')
    }
  }

  const pick = (idx: number, e: React.MouseEvent) => {
    if (picked !== null) return
    setPicked(idx)
    if (idx === r.correct) {
      award(10, { x: e.clientX, y: e.clientY, reason: 'decoded', sound: 'correct' })
      setTimeout(() => {
        if (i + 1 >= rounds.length) finish()
        else {
          setI(i + 1)
          setPicked(null)
        }
      }, 750)
    } else {
      setMisses((m) => m + 1)
      breakCombo()
      if (sfxOn) play('wrong')
      setTimeout(() => setPicked(null), 600) // let them retry
    }
  }

  return (
    <div data-overlay className="fixed inset-0 z-[160] flex items-center justify-center bg-ink-950/90 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-[620px] max-w-full rounded-2xl border border-glass-warm/40 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">🕵️ Decode the vault</h2>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">✕</button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <motion.div initial={{ scale: 0.4, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} className="text-[64px]">
              🔓
            </motion.div>
            <div className="text-[22px] font-black text-glass-warm">VAULT CRACKED!</div>
            <div className="mt-1 text-[14px] text-gray-300">
              {misses === 0 ? 'Flawless run 🎯 — ' : ''}
              {alreadyCracked ? 'already looted (no coins)' : `+${payout}🪙 hidden coins`}
            </div>
            <button
              onClick={onClose}
              className="no-drag mt-5 rounded-lg bg-glass-accent px-6 py-2 text-[14px] font-semibold text-ink-950 hover:brightness-110"
            >
              Claim & close
            </button>
          </div>
        ) : (
          r && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-md bg-glass-warm/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-glass-warm">
                  Round {i + 1}/{rounds.length}
                </span>
                <span className="text-[11px] text-ink-600">misses: {misses}</span>
              </div>

              <p className="mb-2 text-[15px] font-medium text-gray-100">
                {r.kind === 'predict' ? 'After this line runs, what is ' : 'What is '}
                <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-glass-accent">{r.label}</code>
                {r.kind === 'predict' ? '?' : ' doing here?'}
              </p>

              {line !== undefined && (
                <pre className="mb-4 overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[12.5px] text-gray-200">
                  <span className="mr-3 select-none text-ink-600">{r.line}</span>
                  {line}
                </pre>
              )}

              <div className="space-y-2">
                {r.options.map((opt, idx) => {
                  const reveal = picked !== null
                  const isCorrect = idx === r.correct
                  const isPicked = picked === idx
                  const state = reveal && isCorrect ? 'correct' : isPicked && !isCorrect ? 'wrong' : 'idle'
                  return (
                    <motion.button
                      key={idx}
                      onClick={(e) => pick(idx, e)}
                      whileTap={{ scale: 0.99 }}
                      animate={state === 'wrong' ? { x: [0, -8, 8, -4, 4, 0] } : {}}
                      className={cn(
                        'no-drag flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors',
                        state === 'correct'
                          ? 'border-glass-add bg-glass-add/15 text-white'
                          : state === 'wrong'
                            ? 'border-glass-del bg-glass-del/15 text-white'
                            : 'border-ink-700 bg-ink-850 text-gray-200 hover:border-glass-warm/50'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold',
                          state === 'correct' ? 'bg-glass-add text-ink-950' : state === 'wrong' ? 'bg-glass-del text-white' : 'bg-ink-700 text-gray-300'
                        )}
                      >
                        {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </motion.button>
                  )
                })}
              </div>
              <p className="mt-3 text-center text-[11px] text-ink-600">crack every round to open the vault · +10🪙 each</p>
            </>
          )
        )}
      </motion.div>
    </div>
  )
}
