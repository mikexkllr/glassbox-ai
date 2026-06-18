import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InlineExplanation, CodeAnchor } from '@shared/types'
import { tokenize, type Line } from '../lib/highlight'
import { getFileText, cn } from '../lib/files'
import { useStore } from '../store'
import { useGame } from '../game/store'

interface Props {
  file: string
  startLine: number
  endLine: number
  explanations: InlineExplanation[]
  /** Lines (absolute, new-file numbering) to softly glow for a value trace. */
  traceLines?: Set<number>
  /** The single line currently active in a step-through. */
  activeLine?: number | null
}

interface PopState {
  expl: InlineExplanation
  x: number
  y: number
  pinned: boolean
}

export default function PokeableCode({ file, startLine, endLine, explanations, traceLines, activeLine }: Props) {
  const diff = useStore((s) => s.diff)
  const depth = useStore((s) => s.depth)
  const ref = useStore((s) => s.feature)
  const repoPath = useStore((s) => s.repoPath)

  const rewardOnce = useGame((s) => s.rewardOnce)
  const theme = useGame((s) => s.equipped.theme)

  const [lines, setLines] = useState<Line[] | null>(null)
  const [pop, setPop] = useState<PopState | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    if (!repoPath) return
    getFileText(repoPath, ref, file)
      .then(async (text) => {
        const all = text.split('\n')
        const sliceLines = all.slice(startLine - 1, endLine)
        const slice = sliceLines.join('\n')
        try {
          const toks = await tokenize(slice, langOf(file), theme)
          if (alive) setLines(toks)
        } catch {
          // Fallback: render the code unhighlighted rather than spinning forever.
          if (alive) setLines(sliceLines.map((l) => [{ content: l, color: '#c8ccd4', offset: 0 } as Line[number]]))
        }
      })
      .catch(() => {
        if (alive) setLines([[{ content: '(could not load file)', color: '#7d8597', offset: 0 } as Line[number]]])
      })
    return () => {
      alive = false
    }
  }, [repoPath, ref, file, startLine, endLine, theme])

  // line number -> symbols expected on that line
  const bySymbol = useMemo(() => {
    const map = new Map<number, InlineExplanation[]>()
    for (const e of explanations) {
      if (e.file !== file) continue
      if (e.line < startLine || e.line > endLine) continue
      const arr = map.get(e.line) ?? []
      arr.push(e)
      map.set(e.line, arr)
    }
    return map
  }, [explanations, file, startLine, endLine])

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setPop((p) => (p?.pinned ? p : null)), 120)
  }

  const onEnter = (expl: InlineExplanation, el: HTMLElement) => {
    cancelClose()
    const r = el.getBoundingClientRect()
    setPop((p) => (p?.pinned ? p : { expl, x: r.left, y: r.bottom + 6, pinned: false }))
    rewardOnce(`poke:${expl.file}:${expl.line}:${expl.symbol}`, 2, {
      x: r.left + r.width / 2,
      y: r.top,
      sound: 'tick'
    })
  }
  const onClick = (expl: InlineExplanation, el: HTMLElement) => {
    cancelClose()
    const r = el.getBoundingClientRect()
    setPop({ expl, x: r.left, y: r.bottom + 6, pinned: true })
  }

  return (
    <div className="code-surface relative">
      {lines === null ? (
        <div className="px-4 py-3 text-xs text-ink-600">loading code…</div>
      ) : (
        <div className="overflow-x-auto">
          {lines.map((toks, i) => {
            const ln = startLine + i
            const symbols = bySymbol.get(ln)
            const glow = traceLines?.has(ln)
            const active = activeLine === ln
            return (
              <div
                key={i}
                id={`line-${file}-${ln}`}
                className={cn(
                  'code-line flex whitespace-pre px-2',
                  glow && 'trace-glow',
                  active && 'trace-active'
                )}
              >
                <span className="select-none pr-4 pl-1 text-right text-ink-600" style={{ minWidth: 44 }}>
                  {ln}
                </span>
                <span className="flex-1">
                  {toks.map((t, j) => {
                    const sym = symbols?.find((e) => e.symbol === t.content.trim() && t.content.trim().length > 0)
                    if (sym) {
                      return (
                        <span
                          key={j}
                          className="poke"
                          style={{ color: t.color }}
                          onMouseEnter={(ev) => onEnter(sym, ev.currentTarget)}
                          onMouseLeave={scheduleClose}
                          onClick={(ev) => onClick(sym, ev.currentTarget)}
                        >
                          {t.content}
                        </span>
                      )
                    }
                    return (
                      <span key={j} style={{ color: t.color }}>
                        {t.content}
                      </span>
                    )
                  })}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {pop &&
        createPortal(
          <Popover
            pop={pop}
            depth={depth}
            anchor={{ file, startLine: pop.expl.line, endLine: pop.expl.line }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClose={() => setPop(null)}
            askDeeper={async () => {
              if (!diff) return ''
              const res = await window.glassbox.explainDeeper(diff, { file, startLine: pop.expl.line, endLine: pop.expl.line }, pop.expl.deep)
              return res.answer
            }}
          />,
          document.body
        )}
    </div>
  )
}

function Popover({
  pop,
  depth,
  onMouseEnter,
  onMouseLeave,
  onClose,
  askDeeper
}: {
  pop: PopState
  depth: 'gist' | 'deep'
  anchor: CodeAnchor
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClose: () => void
  askDeeper: () => Promise<string>
}) {
  const [deeper, setDeeper] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const e = pop.expl
  const text = depth === 'gist' ? e.gist : e.deep
  const x = Math.min(pop.x, window.innerWidth - 380)
  const y = Math.min(pop.y, window.innerHeight - 200)

  return (
    <div
      className="fixed z-50 w-[360px] animate-fade-in rounded-lg border border-ink-700 bg-ink-850 p-3 shadow-2xl"
      style={{ left: x, top: y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] text-glass-accent">{e.symbol}</code>
          <span className="text-[10px] uppercase tracking-wide text-ink-600">{e.kind}</span>
        </div>
        {pop.pinned && (
          <button onClick={onClose} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-gray-200">{text}</p>
      {deeper && (
        <p className="mt-2 border-t border-ink-700 pt-2 text-[12.5px] leading-relaxed text-gray-300">{deeper}</p>
      )}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-600">
        <span>{pop.pinned ? 'pinned' : 'click to pin'}</span>
        <button
          className="no-drag ml-auto rounded bg-ink-800 px-2 py-1 text-glass-accent2 hover:bg-ink-700 disabled:opacity-50"
          disabled={busy || !!deeper}
          onClick={async () => {
            setBusy(true)
            setDeeper(await askDeeper())
            setBusy(false)
          }}
        >
          {busy ? 'digging…' : 'Go deeper ⤓'}
        </button>
      </div>
    </div>
  )
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', sh: 'bash', bash: 'bash', vue: 'vue'
}
function langOf(path: string): string {
  return EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'text'
}
