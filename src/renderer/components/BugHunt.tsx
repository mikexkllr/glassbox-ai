import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FindingSeverity, ReviewFinding, WalkthroughSection } from '@shared/types'
import { useStore } from '../store'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { getFileText, cn } from '../lib/files'
import { tokenize, type Line } from '../lib/highlight'

/**
 * The Bug Hunt — a review-training game. The agent has already flagged the
 * GENUINE potential issues in each section (`reviewFindings`); here they're
 * hidden behind vague hints and the reader has to *spot* them: select the
 * suspect lines, flag them, and either land a hidden finding (reward + deep
 * explanation) or raise a free-form concern the AI grades. Trains the muscle the
 * rest of the app deliberately doesn't: judgement, not just comprehension.
 */

const SEV: Record<FindingSeverity, { label: string; emoji: string; cls: string; bounty: number }> = {
  bug: { label: 'Bug', emoji: '🐛', cls: 'border-glass-del/60 text-glass-del', bounty: 30 },
  smell: { label: 'Smell', emoji: '👃', cls: 'border-glass-warm/60 text-glass-warm', bounty: 20 },
  nit: { label: 'Nit', emoji: '🔧', cls: 'border-glass-accent/60 text-glass-accent', bounty: 10 },
  question: { label: 'Question', emoji: '❓', cls: 'border-glass-accent2/60 text-glass-accent2', bounty: 12 }
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS <= bE && bS <= aE

interface Selection {
  file: string
  a: number
  b: number
}
type FlagResult =
  | { kind: 'hit'; finding: ReviewFinding }
  | { kind: 'assessed'; score: number; verdict: string; reasoning: string; severity: FindingSeverity }
  | { kind: 'dupe' }

export default function BugHunt({ onClose, focusSectionId }: { onClose: () => void; focusSectionId?: string }) {
  const diff = useStore((s) => s.diff)
  const sections = useStore((s) => s.sections)
  const overview = useStore((s) => s.overview)
  const findings = useStore((s) => s.findings)
  const addFinding = useStore((s) => s.addFinding)

  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)
  const pushFx = useGame((s) => s.pushFx)
  const sfxOn = useGame((s) => s.sfxOn)

  // Sections that are loaded AND have something to hunt, in overview order.
  const huntable = useMemo(() => {
    const order = overview?.sections.map((p) => p.id) ?? Object.keys(sections)
    return order
      .map((id) => sections[id])
      .filter((s): s is WalkthroughSection => !!s && (s.reviewFindings?.length ?? 0) > 0)
  }, [sections, overview])

  const [activeId, setActiveId] = useState<string | null>(
    focusSectionId && sections[focusSectionId]?.reviewFindings?.length ? focusSectionId : huntable[0]?.id ?? null
  )
  const section = (activeId && sections[activeId]) || null

  const [sel, setSel] = useState<Selection | null>(null)
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState<FindingSeverity>('bug')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FlagResult | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  // Reset transient state when switching sections.
  useEffect(() => {
    setSel(null)
    setNote('')
    setResult(null)
    setRevealed(new Set())
  }, [activeId])

  const foundIds = useMemo(
    () => new Set(findings.filter((f) => f.sectionId === activeId && f.matchedId).map((f) => f.matchedId!)),
    [findings, activeId]
  )
  const planted = section?.reviewFindings ?? []
  const foundCount = planted.filter((f) => foundIds.has(f.id)).length

  // The file windows to render: union of chunk ranges and finding ranges, so
  // every planted finding's lines are actually on screen and clickable.
  const fileWindows = useMemo(() => {
    if (!section) return []
    const map = new Map<string, { start: number; end: number }>()
    const bump = (file: string, s: number, e: number) => {
      const cur = map.get(file)
      map.set(file, cur ? { start: Math.min(cur.start, s), end: Math.max(cur.end, e) } : { start: s, end: e })
    }
    for (const c of section.chunks) bump(c.file, c.startLine, c.endLine)
    for (const f of section.reviewFindings) bump(f.file, f.startLine, f.endLine)
    return [...map.entries()].map(([file, r]) => ({ file, start: Math.max(1, r.start - 1), end: r.end + 1 }))
  }, [section])

  const clickLine = (file: string, ln: number, shift: boolean) => {
    setResult(null)
    setSel((cur) => (shift && cur && cur.file === file ? { file, a: cur.a, b: ln } : { file, a: ln, b: ln }))
  }

  const submitFlag = async () => {
    if (!sel || !section || !diff || busy) return
    const start = Math.min(sel.a, sel.b)
    const end = Math.max(sel.a, sel.b)

    // 1) Did they land a planted finding that isn't found yet?
    const hit = planted.find((f) => !foundIds.has(f.id) && f.file === sel.file && overlaps(start, end, f.startLine, f.endLine))
    if (hit) {
      addFinding({
        id: crypto.randomUUID(),
        sectionId: section.id,
        file: sel.file,
        startLine: start,
        endLine: end,
        note: note.trim(),
        severity: hit.severity,
        matchedId: hit.id,
        createdAt: Date.now()
      })
      rewardOnce(`hunt:found:${section.id}:${hit.id}`, SEV[hit.severity].bounty, {
        reason: 'bug spotted! 🐛',
        sound: 'jackpot',
        confetti: true
      })
      unlock('bug_hunter')
      // Cleared the whole section?
      if (foundCount + 1 >= planted.length) {
        rewardOnce(`hunt:clear:${section.id}`, 40, { reason: 'hunt cleared 🦅', sound: 'levelup', confetti: true })
        unlock('eagle_eye')
      }
      setResult({ kind: 'hit', finding: hit })
      setSel(null)
      setNote('')
      return
    }

    // 2) Free-form concern — make them say what's wrong, then let the AI judge.
    if (!note.trim()) {
      pushFx({ kind: 'toast', text: 'Add a note — what looks wrong here?', tone: 'bad' })
      return
    }
    setBusy(true)
    try {
      const a = await window.glassbox.assessFinding(diff, { file: sel.file, startLine: start, endLine: end }, note.trim())
      const id = crypto.randomUUID()
      addFinding({
        id,
        sectionId: section.id,
        file: sel.file,
        startLine: start,
        endLine: end,
        note: note.trim(),
        severity: a.severity,
        aiScore: a.score,
        createdAt: Date.now()
      })
      const payout = Math.max(2, Math.round((a.score / 100) * 22))
      rewardOnce(`hunt:freeform:${id}`, payout, {
        reason: a.score >= 60 ? 'sharp eye 👁️' : 'logged',
        sound: a.score >= 60 ? 'coin' : 'tick'
      })
      if (a.score >= 50) unlock('bug_hunter')
      setResult({ kind: 'assessed', score: a.score, verdict: a.verdict, reasoning: a.reasoning, severity: a.severity })
      setSel(null)
      setNote('')
    } catch (e) {
      pushFx({ kind: 'toast', text: `Couldn't reach the reviewer: ${(e as Error).message}`, tone: 'bad' })
    }
    setBusy(false)
  }

  const revealMissed = () => {
    setRevealed(new Set(planted.filter((f) => !foundIds.has(f.id)).map((f) => f.id)))
    if (sfxOn) play('whoosh')
  }

  const selStart = sel ? Math.min(sel.a, sel.b) : 0
  const selEnd = sel ? Math.max(sel.a, sel.b) : 0

  // Per-file line tint: found findings glow add, revealed glow warm.
  const tintFor = (file: string, ln: number): 'found' | 'revealed' | null => {
    for (const f of planted) {
      if (f.file !== file || ln < f.startLine || ln > f.endLine) continue
      if (foundIds.has(f.id)) return 'found'
      if (revealed.has(f.id)) return 'revealed'
    }
    return null
  }

  return (
    <div data-overlay className="fixed inset-0 z-[155] flex items-center justify-center bg-ink-950/90 p-6" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-full max-h-full w-[920px] max-w-full flex-col overflow-hidden rounded-2xl border border-glass-del/40 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex flex-none items-center gap-3 border-b border-ink-800 px-5 py-3">
          <div className="text-[16px] font-bold text-white">🐛 Bug Hunt</div>
          <div className="text-[12px] text-ink-600">spot what a reviewer would flag · earn the bounty · learn the why</div>
          <button onClick={onClose} className="no-drag ml-auto text-ink-600 hover:text-white">✕</button>
        </div>

        {huntable.length === 0 || !section ? (
          <div className="flex flex-1 items-center justify-center p-10 text-center">
            <div>
              <div className="text-[40px]">🔍</div>
              <p className="mt-3 text-[14px] text-gray-300">No reviewer flags to hunt yet.</p>
              <p className="mt-1 text-[12px] text-ink-600">Explore more sections — Glassbox plants potential issues as it reads them.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* section rail */}
            <aside className="w-52 flex-none overflow-y-auto border-r border-ink-800 p-2">
              {huntable.map((s) => {
                const fnd = new Set(findings.filter((f) => f.sectionId === s.id && f.matchedId).map((f) => f.matchedId))
                const n = s.reviewFindings.length
                const got = s.reviewFindings.filter((f) => fnd.has(f.id)).length
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      'no-drag mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12.5px] hover:bg-ink-800/60',
                      s.id === activeId ? 'bg-glass-del/10 text-white' : 'text-gray-300'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className={cn('flex-none text-[11px]', got === n ? 'text-glass-add' : 'text-ink-600')}>
                      {got}/{n}
                    </span>
                  </button>
                )
              })}
            </aside>

            {/* hunt board */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-none items-center gap-3 border-b border-ink-800 px-5 py-2.5">
                <div className="text-[13px] font-semibold text-white">{section.title}</div>
                <div className="text-[12px] text-glass-del">
                  Found {foundCount}/{planted.length}
                </div>
                <button
                  onClick={revealMissed}
                  disabled={foundCount >= planted.length}
                  className="no-drag ml-auto rounded-lg border border-ink-700 px-2.5 py-1 text-[11.5px] text-gray-300 hover:border-ink-600 disabled:opacity-40"
                >
                  Reveal the ones I missed
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {/* hints */}
                <div className="flex flex-wrap gap-2">
                  {planted.map((f, i) => {
                    const got = foundIds.has(f.id)
                    const shown = got || revealed.has(f.id)
                    return (
                      <div
                        key={f.id}
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-[11.5px]',
                          got ? 'border-glass-add/50 bg-glass-add/5 text-glass-add' : 'border-ink-700 bg-ink-850 text-gray-300'
                        )}
                        title={shown ? f.explanation : undefined}
                      >
                        {got ? '✓ ' : shown ? '👁 ' : '🔍 '}
                        <span className="font-medium">{shown ? `${SEV[f.severity].emoji} ${f.title}` : `Clue ${i + 1}`}</span>
                        {!shown && <span className="text-ink-600"> — {f.hint}</span>}
                      </div>
                    )
                  })}
                </div>

                {/* code to hunt in */}
                {fileWindows.map((w) => (
                  <HuntCode
                    key={w.file}
                    file={w.file}
                    start={w.start}
                    end={w.end}
                    selFile={sel?.file ?? null}
                    selStart={selStart}
                    selEnd={selEnd}
                    tint={(ln) => tintFor(w.file, ln)}
                    onClickLine={clickLine}
                  />
                ))}

                {/* result of last flag */}
                <AnimatePresence>
                  {result && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      {result.kind === 'hit' ? (
                        <FindingCard finding={result.finding} tone="hit" />
                      ) : result.kind === 'assessed' ? (
                        <div
                          className={cn(
                            'rounded-xl border p-4',
                            result.score >= 60 ? 'border-glass-add/40 bg-glass-add/5' : 'border-ink-700 bg-ink-850'
                          )}
                        >
                          <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                            {result.score >= 60 ? '👁️ Fair flag' : '🤔 Noted'} · {SEV[result.severity].emoji} {SEV[result.severity].label}
                            <span className="ml-auto font-mono text-[12px] text-glass-warm">{result.score}/100</span>
                          </div>
                          <p className="mt-1 text-[13px] font-medium text-gray-200">{result.verdict}</p>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-gray-300">{result.reasoning}</p>
                        </div>
                      ) : null}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* revealed-but-unfound explanations */}
                {planted.filter((f) => revealed.has(f.id) && !foundIds.has(f.id)).map((f) => (
                  <FindingCard key={f.id} finding={f} tone="revealed" />
                ))}
              </div>

              {/* flag bar */}
              <div className="flex-none border-t border-ink-800 bg-ink-900/80 p-3">
                {sel ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[12px] text-ink-600">
                      <span className="font-mono text-glass-accent2">
                        {sel.file}:{selStart}
                        {selEnd !== selStart ? `-${selEnd}` : ''}
                      </span>
                      <span>selected — shift-click to extend the range</span>
                      <button onClick={() => setSel(null)} className="no-drag ml-auto text-ink-600 hover:text-white">clear</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {(Object.keys(SEV) as FindingSeverity[]).map((k) => (
                          <button
                            key={k}
                            onClick={() => setSeverity(k)}
                            className={cn(
                              'no-drag rounded-md border px-2 py-1 text-[11.5px]',
                              severity === k ? SEV[k].cls + ' bg-ink-800' : 'border-ink-700 text-ink-600 hover:text-gray-300'
                            )}
                          >
                            {SEV[k].emoji} {SEV[k].label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitFlag()}
                        placeholder="What's wrong here? (needed for a free-form flag)"
                        className="no-drag flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-1.5 text-[13px] outline-none focus:border-glass-del/50"
                      />
                      <button
                        onClick={submitFlag}
                        disabled={busy}
                        className="no-drag rounded-lg bg-gradient-to-r from-glass-del to-glass-warm px-4 py-1.5 text-[13px] font-bold text-ink-950 hover:brightness-110 disabled:opacity-60"
                      >
                        {busy ? '🔎 checking…' : '🚩 Flag it'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-1 py-1 text-center text-[12px] text-ink-600">
                    Click a suspicious line above to flag it. Land a hidden finding for the bounty, or raise your own concern for the AI to judge.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

function FindingCard({ finding, tone }: { finding: ReviewFinding; tone: 'hit' | 'revealed' }) {
  const hit = tone === 'hit'
  return (
    <div className={cn('rounded-xl border p-4', hit ? 'border-glass-add/40 bg-glass-add/5' : 'border-glass-warm/30 bg-glass-warm/5')}>
      <div className="flex items-center gap-2 text-[13px] font-bold text-white">
        {hit ? '🎯 Nailed it!' : '👁 Missed this one'} · {SEV[finding.severity].emoji} {finding.title}
        <span className="ml-auto font-mono text-[11px] text-ink-600">
          {finding.file}:{finding.startLine}-{finding.endLine}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-200">{finding.explanation}</p>
      {finding.suggestion && (
        <div className="mt-2 rounded-md border border-glass-accent/30 bg-glass-accent/5 p-2 text-[12.5px] text-gray-200">
          <span className="text-[11px] font-bold uppercase tracking-wide text-glass-accent">Fix: </span>
          {finding.suggestion}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clickable code window
// ---------------------------------------------------------------------------

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', sh: 'bash', bash: 'bash', vue: 'vue'
}
const langOf = (path: string) => EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'text'

function HuntCode({
  file,
  start,
  end,
  selFile,
  selStart,
  selEnd,
  tint,
  onClickLine
}: {
  file: string
  start: number
  end: number
  selFile: string | null
  selStart: number
  selEnd: number
  tint: (ln: number) => 'found' | 'revealed' | null
  onClickLine: (file: string, ln: number, shift: boolean) => void
}) {
  const repoPath = useStore((s) => s.repoPath)
  const ref = useStore((s) => s.feature)
  const theme = useGame((s) => s.equipped.theme)
  const [lines, setLines] = useState<Line[] | null>(null)

  useEffect(() => {
    let alive = true
    if (!repoPath) return
    getFileText(repoPath, ref, file)
      .then(async (text) => {
        const slice = text.split('\n').slice(start - 1, end)
        try {
          const toks = await tokenize(slice.join('\n'), langOf(file), theme)
          if (alive) setLines(toks)
        } catch {
          if (alive) setLines(slice.map((l) => [{ content: l, color: '#c8ccd4', offset: 0 } as Line[number]]))
        }
      })
      .catch(() => alive && setLines([[{ content: '(could not load file)', color: '#7d8597', offset: 0 } as Line[number]]]))
    return () => {
      alive = false
    }
  }, [repoPath, ref, file, start, end, theme])

  return (
    <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
      <div className="border-b border-ink-700 bg-ink-850 px-3 py-1.5 font-mono text-[10.5px] text-ink-600">{file}</div>
      {lines === null ? (
        <div className="px-4 py-3 text-xs text-ink-600">loading code…</div>
      ) : (
        <div className="overflow-x-auto py-1">
          {lines.map((toks, i) => {
            const ln = start + i
            const selected = selFile === file && ln >= selStart && ln <= selEnd
            const t = tint(ln)
            return (
              <div
                key={i}
                onClick={(e) => onClickLine(file, ln, e.shiftKey)}
                className={cn(
                  'flex cursor-pointer whitespace-pre px-2 hover:bg-ink-800/50',
                  selected && 'bg-glass-del/20 ring-1 ring-inset ring-glass-del/40',
                  !selected && t === 'found' && 'bg-glass-add/10',
                  !selected && t === 'revealed' && 'bg-glass-warm/10'
                )}
              >
                <span className="select-none pr-3 pl-1 text-right text-ink-600" style={{ minWidth: 40 }}>
                  {ln}
                </span>
                <span className="flex-1">
                  {toks.map((tok, j) => (
                    <span key={j} style={{ color: tok.color }}>
                      {tok.content}
                    </span>
                  ))}
                </span>
                {t === 'found' && <span className="flex-none pl-2 text-[11px] text-glass-add">✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
