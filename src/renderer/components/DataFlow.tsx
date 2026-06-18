import { Fragment, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'

const base = (p: string) => p.split('/').pop() ?? p

/** A global "river" view: every traceable value in the change, shown as a stream
 * of steps with light flowing left-to-right through the files it touches. */
export default function DataFlow({ onClose }: { onClose: () => void }) {
  const sectionsMap = useStore((s) => s.sections)
  const values = useMemo(
    () =>
      Object.values(sectionsMap)
        .flatMap((s) => s.traceableValues ?? [])
        .filter((v) => v.steps.length >= 2)
        .slice(0, 7),
    [sectionsMap]
  )

  return (
    <div data-overlay className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="flex max-h-full w-[820px] flex-col overflow-hidden rounded-2xl border border-glass-accent/40 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <div>
            <h2 className="text-[17px] font-bold text-white">🌊 Data flow</h2>
            <p className="text-[11px] text-ink-600">watch values move through the change · example values highlighted</p>
          </div>
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          {values.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-ink-600">
              No traceable values in the loaded sections yet — open a few more and they'll flow here. 🌊
            </div>
          ) : (
            values.map((v) => (
              <div key={v.id} className="rounded-xl border border-ink-700 bg-ink-850/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex-none rounded-md bg-glass-accent2/15 px-2 py-0.5 font-mono text-[12px] font-bold text-glass-accent2">
                    {v.name}
                  </span>
                  <span className="truncate text-[11px] text-ink-600">{v.description}</span>
                </div>
                <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                  {v.steps.slice(0, 6).map((s, i) => (
                    <Fragment key={i}>
                      {i > 0 && <div className="flow-line my-auto h-0.5 min-w-[22px] flex-1" />}
                      <div className="flex-none rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-center">
                        <div className="text-[11px] text-gray-200">{s.label}</div>
                        <div className="font-mono text-[9.5px] text-ink-600">
                          {base(s.file)}:{s.line}
                        </div>
                        {s.exampleValue && (
                          <div className="mt-0.5 truncate font-mono text-[10px] text-glass-warm">= {s.exampleValue}</div>
                        )}
                      </div>
                    </Fragment>
                  ))}
                  {v.steps.length > 6 && <span className="my-auto px-1 text-ink-600">…</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  )
}
