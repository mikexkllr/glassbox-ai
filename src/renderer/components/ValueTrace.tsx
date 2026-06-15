import { motion, AnimatePresence } from 'framer-motion'
import type { TraceableValue } from '@shared/types'
import { cn } from '../lib/files'

interface Props {
  value: TraceableValue
  active: boolean
  stepIndex: number
  onActivate: () => void
  onStep: (i: number) => void
}

/**
 * Visual value trace + step-through. Stepping highlights the matching code line
 * (handled by the parent via activeLine) and animates the value as it flows.
 */
export default function ValueTrace({ value, active, stepIndex, onActivate, onStep }: Props) {
  const steps = value.steps
  const cur = steps[stepIndex]

  return (
    <div className={cn('rounded-lg border bg-ink-900/60 p-3', active ? 'border-glass-accent2/60' : 'border-ink-700')}>
      <button onClick={onActivate} className="no-drag flex w-full items-center gap-2 text-left">
        <span className="text-glass-accent2">⟿</span>
        <span className="font-mono text-[13px] text-glass-accent2">{value.name}</span>
        <span className="truncate text-[12px] text-ink-600">— {value.description}</span>
        <span className="ml-auto text-[11px] text-ink-600">{active ? '▾' : 'trace ▸'}</span>
      </button>

      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2">
              <button
                className="no-drag rounded bg-ink-800 px-2 py-1 text-[11px] hover:bg-ink-700 disabled:opacity-40"
                disabled={stepIndex <= 0}
                onClick={() => onStep(Math.max(0, stepIndex - 1))}
              >
                ◀ prev
              </button>
              <div className="text-[11px] text-ink-600">
                step {stepIndex + 1} / {steps.length}
              </div>
              <button
                className="no-drag rounded bg-ink-800 px-2 py-1 text-[11px] hover:bg-ink-700 disabled:opacity-40"
                disabled={stepIndex >= steps.length - 1}
                onClick={() => onStep(Math.min(steps.length - 1, stepIndex + 1))}
              >
                next ▶
              </button>
              {cur?.exampleValue !== undefined && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={stepIndex}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="ml-auto rounded bg-glass-accent2/15 px-2 py-1 font-mono text-[12px] text-glass-accent2"
                  >
                    {value.name} = {cur.exampleValue}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>

            <div className="relative mt-3 pl-4">
              <div className="absolute bottom-1 left-[6px] top-1 w-px bg-ink-700" />
              {steps.map((s, i) => {
                const on = i === stepIndex
                const done = i < stepIndex
                return (
                  <button
                    key={i}
                    onClick={() => onStep(i)}
                    className="no-drag relative block w-full py-1.5 text-left"
                  >
                    <span
                      className={cn(
                        'absolute -left-[14px] top-2 h-2.5 w-2.5 rounded-full border',
                        on
                          ? 'border-glass-accent2 bg-glass-accent2'
                          : done
                            ? 'border-glass-accent2/60 bg-glass-accent2/40'
                            : 'border-ink-600 bg-ink-850'
                      )}
                    />
                    {on && (
                      <motion.span
                        layoutId={`trace-${value.id}`}
                        className="absolute -left-[16px] top-[5px] h-3.5 w-3.5 rounded-full ring-2 ring-glass-accent2/50"
                      />
                    )}
                    <div className={cn('text-[12.5px]', on ? 'text-white' : 'text-gray-400')}>{s.label}</div>
                    <div className="font-mono text-[10.5px] text-ink-600">
                      {s.file}:{s.line}
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
