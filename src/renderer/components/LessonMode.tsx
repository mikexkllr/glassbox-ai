import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WalkChunk, InlineExplanation } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { getFileText, cn } from '../lib/files'

interface Step {
  kind: string
  title: string
  body: string
  line?: number
  symbol?: string
}

/**
 * Brilliant-style focused lesson: steps through ONE code block, one idea at a
 * time (what changed → each symbol on its line → how it fits → gotcha), with
 * progress dots and a coin per new step. Sub-file, bite-sized, distraction-free.
 */
export default function LessonMode({
  chunk,
  explanations,
  onClose
}: {
  chunk: WalkChunk
  explanations: InlineExplanation[]
  onClose: () => void
}) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const depth = useStore((s) => s.depth)
  const rewardOnce = useGame((s) => s.rewardOnce)

  const [code, setCode] = useState<string[]>([])
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!repoPath) return
    getFileText(repoPath, ref, chunk.file).then((t) => setCode(t.split('\n')))
  }, [repoPath, ref, chunk.file])

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = []
    out.push({ kind: 'What changed', title: chunk.title, body: chunk.gist })
    for (const e of explanations
      .filter((e) => e.file === chunk.file && e.line >= chunk.startLine && e.line <= chunk.endLine)
      .sort((a, b) => a.line - b.line)) {
      out.push({
        kind: `${e.kind} · line ${e.line}`,
        title: e.symbol,
        body: depth === 'gist' ? e.gist : e.deep,
        line: e.line,
        symbol: e.symbol
      })
    }
    out.push({ kind: 'What it does', title: 'The behaviour', body: chunk.story.what })
    out.push({ kind: 'How it fits', title: 'The bigger picture', body: chunk.story.fits })
    if (chunk.story.calledBy && chunk.story.calledBy.toLowerCase() !== 'n/a')
      out.push({ kind: 'Call sites', title: 'Who uses it', body: chunk.story.calledBy })
    if (chunk.story.gotcha) out.push({ kind: '⚠ Gotcha', title: 'Watch out', body: chunk.story.gotcha })
    out.push({ kind: 'Done', title: 'You got this block 🎉', body: 'You understood this change line by line. On to the next!' })
    return out
  }, [chunk, explanations, depth])

  const step = steps[i]
  const isLast = i === steps.length - 1

  // drip a coin for each newly-reached step; bonus on finish.
  useEffect(() => {
    rewardOnce(`lesson:${chunk.file}:${chunk.id}:${i}`, 2, { sound: 'tick' })
    if (i === steps.length - 1) rewardOnce(`lessondone:${chunk.file}:${chunk.id}`, 12, { reason: 'lesson clear!', sound: 'levelup', confetti: true })
  }, [i])

  const next = () => (isLast ? onClose() : setI((x) => Math.min(steps.length - 1, x + 1)))
  const back = () => setI((x) => Math.max(0, x - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, isLast])

  return (
    <div data-overlay className="fixed inset-0 z-[160] flex items-center justify-center bg-ink-950/90 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex w-[620px] max-w-full flex-col rounded-2xl border border-glass-accent/40 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* progress dots */}
        <div className="mb-5 flex items-center gap-1.5">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                idx < i ? 'bg-glass-accent2' : idx === i ? 'bg-glass-accent' : 'bg-ink-800'
              )}
            />
          ))}
          <button onClick={onClose} className="no-drag ml-2 text-[12px] text-ink-600 hover:text-white">esc</button>
        </div>

        <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-glass-accent">{step.kind}</div>

        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            <h2 className="text-[22px] font-bold text-white">
              {step.symbol ? <code className="rounded bg-ink-800 px-2 py-0.5 font-mono text-glass-accent">{step.symbol}</code> : step.title}
            </h2>

            {step.line && code[step.line - 1] !== undefined && (
              <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-[12.5px] text-gray-200">
                <span className="mr-3 select-none text-ink-600">{step.line}</span>
                {code[step.line - 1]}
              </pre>
            )}

            <p className="mt-3 text-[15px] leading-relaxed text-gray-200">{step.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={back}
            disabled={i === 0}
            className="no-drag rounded-lg px-4 py-2 text-[13px] text-ink-600 hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <span className="text-[11px] text-ink-600">
            {i + 1} / {steps.length}
          </span>
          <button
            onClick={next}
            className="no-drag rounded-lg bg-glass-accent px-5 py-2 text-[14px] font-semibold text-ink-950 hover:brightness-110"
          >
            {isLast ? 'Finish 🎉' : 'Next →'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
