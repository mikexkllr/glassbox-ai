import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { cn } from '../lib/files'

/** Fog-of-war over the diff: every changed file as a node sized by churn and lit
 * up once you've walked the section it belongs to. Big unread files glow red —
 * that's where the review risk is. Click a node to warp to its section. */
export default function BlastRadius({ onClose }: { onClose: () => void }) {
  const diff = useStore((s) => s.diff)
  const overview = useStore((s) => s.overview)
  const walked = useStore((s) => s.walked)
  const setViewMode = useStore((s) => s.setViewMode)
  const setSlide = useStore((s) => s.setSlide)

  const data = useMemo(() => {
    if (!diff) return null
    const sections = overview?.sections ?? []
    const walkedSet = new Set(walked)
    const fileToSection = new Map<string, number>()
    const mapped = new Set<string>()
    sections.forEach((sec, i) => {
      for (const f of sec.files) {
        if (!fileToSection.has(f)) fileToSection.set(f, i)
        if (walkedSet.has(sec.id)) mapped.add(f)
      }
    })
    const files = diff.files.map((f) => ({
      path: f.path,
      churn: f.additions + f.deletions,
      mapped: mapped.has(f.path),
      section: fileToSection.get(f.path)
    }))
    const maxChurn = Math.max(1, ...files.map((f) => f.churn))
    const threshold = maxChurn * 0.5
    files.sort((a, b) => b.churn - a.churn)
    return {
      files: files.map((f) => ({ ...f, risk: !f.mapped && f.churn >= threshold })),
      mappedCount: files.filter((f) => f.mapped).length,
      total: files.length,
      maxChurn
    }
  }, [diff, overview, walked])

  if (!data) return null

  const warp = (section?: number) => {
    if (section === undefined) return
    setViewMode('presentation')
    setSlide(section + 1)
    onClose()
  }

  return (
    <div data-overlay className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="flex max-h-full w-[760px] flex-col overflow-hidden rounded-2xl border border-glass-accent2/40 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <div>
            <h2 className="text-[17px] font-bold text-white">🗺️ Blast radius</h2>
            <p className="text-[11px] text-ink-600">size = lines changed · click a node to warp there</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-glass-accent2/40 bg-glass-accent2/10 px-3 py-1 text-[12px] font-bold text-glass-accent2">
              {data.mappedCount} / {data.total} mapped
            </span>
            <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap content-start items-center justify-center gap-x-3 gap-y-4 overflow-y-auto p-6">
          {data.files.map((f) => {
            const d = 42 + Math.round((f.churn / data.maxChurn) * 70)
            const name = f.path.split('/').pop() ?? f.path
            return (
              <button
                key={f.path}
                onClick={() => warp(f.section)}
                title={`${f.path} · ${f.churn} lines changed · ${f.mapped ? 'mapped' : 'unread'}`}
                disabled={f.section === undefined}
                className={cn('no-drag flex flex-col items-center gap-1', f.section === undefined && 'cursor-default')}
                style={{ width: Math.max(d, 72) }}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full border-2 transition-transform',
                    f.section !== undefined && 'hover:scale-105',
                    f.mapped
                      ? 'border-glass-accent2 bg-glass-accent2/15 text-glass-accent2'
                      : f.risk
                        ? 'border-glass-del bg-glass-del/10 text-glass-del'
                        : 'border-ink-700 bg-ink-800/60 text-ink-500'
                  )}
                  style={{ width: d, height: d }}
                >
                  <span className="text-[13px] font-black">{f.mapped ? '✓' : f.risk ? '!' : ''}</span>
                </span>
                <span className={cn('max-w-[92px] truncate text-[10.5px]', f.mapped ? 'text-gray-300' : 'text-ink-600')}>
                  {name}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 border-t border-ink-800 px-5 py-2.5 text-[11px] text-ink-600">
          <Legend cls="border-glass-accent2 bg-glass-accent2/15" label="mapped — you get it" />
          <Legend cls="border-ink-700 bg-ink-800/60" label="fogged — unread" />
          <Legend cls="border-glass-del bg-glass-del/10" label="big + unread = risk" />
        </div>
      </motion.div>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-full border-2', cls)} />
      {label}
    </span>
  )
}
