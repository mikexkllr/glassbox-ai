import { useState } from 'react'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { cn } from '../lib/files'
import type { WalkChunk } from '@shared/types'

const KIND_SYM: Record<string, string> = {
  function: 'ƒ',
  variable: 'x',
  constant: 'C',
  type: 'T',
  parameter: 'p',
  import: '↓',
  other: '•'
}

const KIND_DOT: Record<string, string> = {
  added: 'bg-glass-add',
  modified: 'bg-glass-accent',
  removed: 'bg-glass-del'
}

/** A two-level coverage map: sections → code blocks (sub-file scope). Navigation, not a grade. */
export default function UnderstandingMap() {
  const overview = useStore((s) => s.overview)
  const sections = useStore((s) => s.sections)
  const walked = useStore((s) => s.walked)
  const live = useStore((s) => s.live)
  const openSections = useStore((s) => s.openSections)
  const setSectionOpen = useStore((s) => s.setSectionOpen)
  const viewMode = useStore((s) => s.viewMode)
  const slideIndex = useStore((s) => s.slideIndex)
  const setSlide = useStore((s) => s.setSlide)
  const rewarded = useGame((s) => s.rewarded)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggleChunk = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  const plans = overview?.sections ?? []
  const total = plans.length
  const done = plans.filter((p) => walked.includes(p.id)).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const present = viewMode === 'presentation'

  const goSection = (id: string, idx: number) => {
    setSectionOpen(id, true)
    if (present) setSlide(idx + 1)
    else setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }
  const goChunk = (sectionId: string, idx: number, chunk: WalkChunk) => {
    setSectionOpen(sectionId, true)
    if (present) setSlide(idx + 1)
    setTimeout(
      () => document.getElementById(`chunk-${sectionId}-${chunk.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      present ? 140 : 90
    )
  }
  const goLine = (sectionId: string, idx: number, file: string, line: number) => {
    setSectionOpen(sectionId, true)
    if (present) setSlide(idx + 1)
    setTimeout(() => {
      const el = document.getElementById(`line-${file}-${line}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (el) {
        el.classList.remove('line-flash')
        void el.offsetWidth // restart animation
        el.classList.add('line-flash')
        setTimeout(() => el.classList.remove('line-flash'), 1400)
      }
    }, present ? 220 : 140)
  }

  return (
    <aside className="flex h-full w-64 flex-none flex-col border-r border-ink-800 bg-ink-900/40">
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-600">Understanding map</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-glass-accent2 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-600">
            {done}/{total}
          </span>
        </div>
        <p className="mt-1 text-[10.5px] text-ink-600">
          {pct === 100 ? "you've walked the whole change ✓" : 'sections → blocks you have explored'}
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {plans.length > 0 && (
          <button
            onClick={() => setSlide(0)}
            className={cn(
              'no-drag flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-ink-800/60',
              present && slideIndex === 0 && 'bg-glass-accent/10'
            )}
          >
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-glass-accent/15 text-[10px] text-glass-accent">✦</span>
            <span className="text-[12.5px] text-gray-200">The big picture</span>
          </button>
        )}
        {plans.map((p, i) => {
          const isWalked = walked.includes(p.id)
          const isBusy = live[p.id]?.busy
          const section = sections[p.id]
          const isOpen = present ? !!section : openSections[p.id] ?? i === 0
          const isCurrent = present && slideIndex === i + 1
          return (
            <div key={p.id}>
              <button
                onClick={() => (!present && isOpen && section ? setSectionOpen(p.id, false) : goSection(p.id, i))}
                className={cn(
                  'no-drag flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-ink-800/60',
                  isCurrent && 'bg-glass-accent/10'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px]',
                    isWalked ? 'bg-glass-accent2/20 text-glass-accent2' : section ? 'bg-glass-accent/15 text-glass-accent' : 'bg-ink-800 text-ink-600'
                  )}
                >
                  {isWalked ? '✓' : isBusy ? '·' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[12.5px]', isWalked ? 'text-gray-300' : 'text-gray-200')}>{p.title}</div>
                  <div className="truncate text-[10.5px] text-ink-600">
                    {isBusy ? 'investigating…' : section ? `${section.chunks.length} blocks` : `${p.files.length} file${p.files.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                {section && !present && <span className="mt-0.5 text-[10px] text-ink-600">{isOpen ? '▾' : '▸'}</span>}
              </button>

              {/* sub-file scope: the code blocks */}
              {section && isOpen && (
                <div className="mb-1 ml-3 border-l border-ink-800 pl-2">
                  {section.chunks.map((c) => {
                    const learned = !!rewarded[`lessondone:${c.file}:${c.id}`]
                    const ckey = `${p.id}:${c.id}`
                    const symbols = section.inlineExplanations
                      .filter((e) => e.file === c.file && e.line >= c.startLine && e.line <= c.endLine)
                      .sort((a, b) => a.line - b.line)
                    const isExp = expanded[ckey] ?? true
                    return (
                      <div key={c.id}>
                        <div className="group flex items-center rounded-md hover:bg-ink-800/60">
                          <button
                            onClick={() => goChunk(p.id, i, c)}
                            className="no-drag flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            title={`${c.file}:${c.startLine}-${c.endLine}`}
                          >
                            <span className={cn('h-1.5 w-1.5 flex-none rounded-full', KIND_DOT[c.changeKind] ?? 'bg-ink-600')} />
                            <span className={cn('truncate text-[11.5px]', learned ? 'text-gray-400' : 'text-gray-300')}>{c.title}</span>
                            {learned && <span className="text-[10px] text-glass-accent2">✓</span>}
                          </button>
                          {symbols.length > 0 && (
                            <button
                              onClick={() => toggleChunk(ckey)}
                              className="no-drag px-1.5 py-1.5 text-[9px] text-ink-600 hover:text-white"
                              title={`${symbols.length} symbols`}
                            >
                              {isExp ? '▾' : '▸'}
                            </button>
                          )}
                        </div>

                        {/* symbol level — scope all the way to the identifier */}
                        {isExp && (
                          <div className="ml-3 border-l border-ink-800 pl-2">
                            {symbols.map((e, si) => (
                              <button
                                key={si}
                                onClick={() => goLine(p.id, i, e.file, e.line)}
                                className="no-drag flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-ink-800/60"
                                title={`${e.kind} · line ${e.line}`}
                              >
                                <span className="w-3 flex-none text-center font-mono text-[9px] text-glass-accent">{KIND_SYM[e.kind] ?? '•'}</span>
                                <span className="truncate font-mono text-[11px] text-gray-400">{e.symbol}</span>
                                <span className="ml-auto font-mono text-[9.5px] text-ink-600">:{e.line}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {section.chunks.length === 0 && <div className="px-2 py-1 text-[10.5px] text-ink-600">no code blocks</div>}
                </div>
              )}
            </div>
          )
        })}
        {plans.length === 0 && <div className="px-2 py-4 text-[12px] text-ink-600">mapping the change…</div>}
      </nav>
    </aside>
  )
}
