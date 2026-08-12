import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BranchInfo } from '@shared/types'
import { useStore } from '../store'
import { cn } from '../lib/files'

/* ── matching ────────────────────────────────────────────────────
   A repo with 200 branches makes a plain <select> useless, so the
   picker is a filtered list: exact > prefix > substring > subsequence
   ("fbar" finds "feature/bar"). Score < 0 means "not a match". */

function isSubsequence(haystack: string, needle: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return needle.length === 0
}

function score(b: BranchInfo, q: string): number {
  const name = b.name.toLowerCase()
  const short = b.short.toLowerCase()
  if (short === q || name === q) return 100
  if (short.startsWith(q)) return 80
  if (name.startsWith(q)) return 70
  const idx = short.indexOf(q)
  if (idx >= 0) return 60 - Math.min(idx, 20)
  const nidx = name.indexOf(q)
  if (nidx >= 0) return 40 - Math.min(nidx, 20)
  return isSubsequence(name, q) ? 10 : -1
}

function rank(branches: BranchInfo[], query: string): BranchInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return branches
  return branches
    .map((b, i) => ({ b, i, s: score(b, q) }))
    .filter((x) => x.s >= 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.b)
}

export function ago(ms: number | null): string {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`
}

/* ── panel geometry ──────────────────────────────────────────── */

interface PanelBox {
  left: number
  width: number
  maxHeight: number
  /** Distance from the viewport's top or bottom edge, depending on `flip`. */
  offset: number
  /** True when the panel opens upward because there's no room below. */
  flip: boolean
}

const GAP = 4
const EDGE = 8
const MIN_PANEL = 360
const MAX_PANEL = 460
/** Most rows painted at once; the rest stay one search away. */
const MAX_ROWS = 120
const MIN_LIST = 200

/**
 * Place the panel against the trigger: at least as wide as it (but wide enough
 * for long `origin/feature/…` names), pulled back inside the viewport, and
 * flipped above the trigger when the space below can't hold a usable list.
 */
function panelBox(r: DOMRect): PanelBox {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(Math.max(r.width, MIN_PANEL), MAX_PANEL, vw - EDGE * 2)
  const left = Math.min(Math.max(EDGE, r.left), vw - width - EDGE)
  const below = vh - r.bottom - GAP - EDGE
  const above = r.top - GAP - EDGE
  const flip = below < MIN_LIST && above > below
  return {
    left,
    width,
    flip,
    offset: flip ? vh - r.top + GAP : r.bottom + GAP,
    maxHeight: Math.max(MIN_LIST, Math.min(360, flip ? above : below))
  }
}

/* ── the picker ──────────────────────────────────────────────── */

interface Props {
  value: string
  onChange: (name: string) => void
  /** Shown above the trigger, e.g. "base" / "feature". */
  label: string
  placeholder?: string
}

export default function BranchPicker({ value, onChange, label, placeholder }: Props) {
  const branches = useStore((s) => s.branches)
  const fetching = useStore((s) => s.fetchingBranches)
  const fetchedAt = useStore((s) => s.fetchedAt)
  const fetchError = useStore((s) => s.fetchError)
  const refreshBranches = useStore((s) => s.refreshBranches)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // The onboarding screen is a stack of animated (transform/opacity) layers,
  // each its own stacking context — an in-flow dropdown gets painted under the
  // CTA and the floating emoji no matter how high its z-index. So the panel is
  // portalled to <body> and positioned against the trigger's viewport rect,
  // which also lets it be wider than the trigger and flip up near the bottom.
  const [box, setBox] = useState<PanelBox | null>(null)
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (el) setBox(panelBox(el.getBoundingClientRect()))
  }, [])

  const selected = branches.find((b) => b.name === value) ?? null
  const results = useMemo(() => rank(branches, query), [branches, query])

  // A monorepo can carry hundreds of stale branches; rendering them all costs
  // more than it helps when searching is right there. Everything is still
  // reachable — the cap only bounds what's painted at once.
  const { locals, remotes, flat, hidden, order } = useMemo(() => {
    const shown = results.slice(0, MAX_ROWS)
    const l = shown.filter((b) => b.kind === 'local')
    const r = shown.filter((b) => b.kind === 'remote')
    // Keyboard navigation walks the rendered order, which is grouped local-first.
    const f = [...l, ...r]
    return {
      locals: l,
      remotes: r,
      flat: f,
      hidden: results.length - shown.length,
      // Row -> keyboard index, so hovering a row is O(1) instead of scanning.
      order: new Map(f.map((b, i) => [b.name, i]))
    }
  }, [results])

  useEffect(() => {
    setActive(0)
  }, [query])

  // Open on the current value so ↓/Enter without typing is a no-op, not a jump.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(order.get(value) ?? 0)
    inputRef.current?.focus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('resize', reposition)
    // Capture phase so scrolling any ancestor keeps the panel pinned.
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  useLayoutEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function commit(b: BranchInfo | undefined): void {
    if (!b) return
    onChange(b.name)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (flat.length ? (a + dir + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      if (!open) return setOpen(true)
      e.preventDefault()
      commit(flat[active])
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const indexOf = (b: BranchInfo): number => order.get(b.name) ?? 0

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
        {label}
      </div>

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'no-drag flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
          open
            ? 'border-glass-accent/60 bg-ink-900'
            : 'border-ink-700 bg-ink-950 hover:border-glass-accent/40'
        )}
      >
        {selected ? (
          <>
            <span className="text-[12px]">{selected.kind === 'local' ? '💻' : '☁️'}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-gray-100">
              {selected.kind === 'remote' && <span className="text-ink-600">{selected.remote}/</span>}
              {selected.short}
            </span>
            <Divergence branch={selected} />
          </>
        ) : (
          <span className="flex-1 truncate text-[13px] text-ink-600">
            {placeholder ?? 'pick a branch…'}
          </span>
        )}
        <span className={cn('text-[10px] text-ink-600 transition-transform', open && 'rotate-180')}>▼</span>
      </button>

      {createPortal(
        <>
          {open && box && (
            // Deliberately not animated: a dropdown is a functional surface, and
            // an entry tween means its opacity — and so its legibility — depends
            // on the animation loop actually running.
            <div
              ref={panelRef}
              style={{
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                ...(box.flip ? { bottom: box.offset } : { top: box.offset })
              }}
              className="no-drag fixed z-[100] flex flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-950 shadow-2xl shadow-black/70"
            >
              <div className="flex flex-none items-center gap-2 border-b border-ink-800 px-2.5 py-2">
                <span className="text-[11px] text-ink-600">🔍</span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="search branches…"
                  className="no-drag min-w-0 flex-1 bg-transparent text-[13px] text-gray-100 placeholder:text-ink-600 focus:outline-none"
                />
                <span className="tabular-nums text-[10.5px] text-ink-600">{results.length}</span>
              </div>

              <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                {flat.length === 0 && (
                  <p className="px-3 py-4 text-center text-[12px] text-ink-600">
                    nothing matches “{query}”
                    {!fetchedAt && <> — try fetching origin below</>}
                  </p>
                )}

                {locals.length > 0 && <GroupLabel>💻 local ({locals.length})</GroupLabel>}
                {locals.map((b) => (
                  <Row
                    key={b.name}
                    branch={b}
                    selected={b.name === value}
                    active={indexOf(b) === active}
                    onHover={() => setActive(indexOf(b))}
                    onPick={() => commit(b)}
                  />
                ))}

                {remotes.length > 0 && <GroupLabel>☁️ remotes ({remotes.length})</GroupLabel>}
                {remotes.map((b) => (
                  <Row
                    key={b.name}
                    branch={b}
                    selected={b.name === value}
                    active={indexOf(b) === active}
                    onHover={() => setActive(indexOf(b))}
                    onPick={() => commit(b)}
                  />
                ))}

                {hidden > 0 && (
                  <p className="px-3 pb-1 pt-2 text-[10.5px] text-ink-600">
                    +{hidden} more — keep typing to narrow
                  </p>
                )}
              </div>

              <div className="flex flex-none items-center justify-between gap-2 border-t border-ink-800 bg-ink-900/60 px-2.5 py-1.5">
                <span className="min-w-0 truncate text-[10.5px] text-ink-600">
                  {fetching ? (
                    <span className="text-glass-accent2">fetching origin…</span>
                  ) : fetchError ? (
                    <span className="text-glass-warm" title={fetchError}>
                      ⚠ fetch failed — showing local refs
                    </span>
                  ) : (
                    <>synced {ago(fetchedAt)}</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshBranches(true)}
                  disabled={fetching}
                  className={cn(
                    'no-drag flex-none rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                    fetching
                      ? 'cursor-wait border-ink-700 text-ink-600'
                      : 'border-ink-700 text-gray-300 hover:border-glass-accent/50 hover:text-white'
                  )}
                >
                  <span className={cn('inline-block', fetching && 'gb-spin-fast')}>⟳</span> fetch
                </button>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
      {children}
    </div>
  )
}

function Row({
  branch,
  selected,
  active,
  onHover,
  onPick
}: {
  branch: BranchInfo
  selected: boolean
  active: boolean
  onHover: () => void
  onPick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-active={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={cn(
        'no-drag flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
        active ? 'bg-glass-accent/15' : 'bg-transparent'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-[12.5px]', selected ? 'font-semibold text-white' : 'text-gray-200')}>
            {branch.kind === 'remote' && <span className="text-ink-600">{branch.remote}/</span>}
            {branch.short}
          </span>
          {branch.current && (
            <span className="flex-none rounded-full bg-glass-accent2/20 px-1.5 text-[9.5px] font-bold uppercase text-glass-accent2">
              checked out
            </span>
          )}
          {branch.kind === 'remote' && branch.hasLocal && (
            <span className="flex-none text-[9.5px] text-ink-600">also local</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-600">
          <span className="flex-none">{ago(branch.committedAt)}</span>
          {branch.subject && <span className="truncate">· {branch.subject}</span>}
        </span>
      </span>
      <Divergence branch={branch} />
      {selected && <span className="flex-none text-[11px] text-glass-accent">✓</span>}
    </button>
  )
}

/** ↑ahead / ↓behind vs the branch's remote counterpart. */
function Divergence({ branch }: { branch: BranchInfo }): React.ReactElement | null {
  if (branch.kind !== 'local' || (!branch.ahead && !branch.behind)) return null
  return (
    <span
      className="flex flex-none items-center gap-1 text-[10.5px] font-semibold tabular-nums"
      title={`${branch.ahead} commit(s) not on ${branch.upstream}, ${branch.behind} commit(s) only on ${branch.upstream}`}
    >
      {branch.ahead > 0 && <span className="text-glass-accent2">↑{branch.ahead}</span>}
      {branch.behind > 0 && <span className="text-glass-warm">↓{branch.behind}</span>}
    </span>
  )
}

/**
 * Compact fetch control for the step header — the same action as the one inside
 * the dropdown, but visible without opening it, since "is this list stale?" is
 * the question people have before they go looking for a branch.
 */
export function BranchFetchButton(): React.ReactElement {
  const fetching = useStore((s) => s.fetchingBranches)
  const fetchedAt = useStore((s) => s.fetchedAt)
  const fetchError = useStore((s) => s.fetchError)
  const refreshBranches = useStore((s) => s.refreshBranches)
  const count = useStore((s) => s.branches.length)

  return (
    <button
      type="button"
      onClick={() => void refreshBranches(true)}
      disabled={fetching}
      title={fetchError ?? 'Run git fetch --all --prune and reload the branch list'}
      className={cn(
        'no-drag flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
        fetching
          ? 'cursor-wait border-ink-700 text-glass-accent2'
          : fetchError
            ? 'border-glass-warm/40 text-glass-warm hover:border-glass-warm'
            : 'border-ink-700 text-ink-600 hover:border-glass-accent/50 hover:text-gray-300'
      )}
    >
      <span className={cn('inline-block', fetching && 'gb-spin-fast')}>⟳</span>
      {fetching ? 'fetching origin…' : fetchError ? 'fetch failed — retry' : `${count} branches · ${ago(fetchedAt)}`}
    </button>
  )
}

/* ── the "what will actually be read" strip ──────────────────── */

/**
 * The diff resolves a branch name to the freshest commit: if the local branch
 * is a strict fast-forward behind `origin/<name>`, origin's tip wins. That's the
 * right default but it's invisible, so state it — and flag the cases where it
 * doesn't apply (diverged or unpushed work stays on the local commit).
 */
export function BranchSync({ names }: { names: string[] }): React.ReactElement | null {
  const branches = useStore((s) => s.branches)
  const fetchedAt = useStore((s) => s.fetchedAt)
  const fetching = useStore((s) => s.fetchingBranches)

  const picked = names
    .filter((n, i) => n && names.indexOf(n) === i)
    .map((n) => branches.find((b) => b.name === n))
    .filter((b): b is BranchInfo => !!b && b.kind === 'local' && (!!b.ahead || !!b.behind))

  if (picked.length === 0) {
    if (fetching) return <Note tone="dim">checking origin for newer commits…</Note>
    if (!fetchedAt) return null
    return <Note tone="dim">✓ in sync with origin</Note>
  }

  return (
    <div className="mt-1.5 space-y-1">
      {picked.map((b) => (
        <Note key={b.name} tone={b.ahead > 0 && b.behind > 0 ? 'warm' : b.behind > 0 ? 'accent' : 'dim'}>
          {b.behind > 0 && b.ahead === 0 && (
            <>
              <b className="text-gray-200">{b.upstream}</b> is {b.behind} commit
              {b.behind === 1 ? '' : 's'} ahead of your local <b className="text-gray-200">{b.short}</b> — we'll
              walk origin's version
            </>
          )}
          {b.behind > 0 && b.ahead > 0 && (
            <>
              <b className="text-gray-200">{b.short}</b> has diverged from {b.upstream} ({b.ahead} yours, {b.behind}{' '}
              theirs) — we'll walk your local commits
            </>
          )}
          {b.behind === 0 && b.ahead > 0 && (
            <>
              <b className="text-gray-200">{b.short}</b> has {b.ahead} unpushed commit{b.ahead === 1 ? '' : 's'} —
              we'll walk your local version
            </>
          )}
        </Note>
      ))}
    </div>
  )
}

function Note({
  tone,
  children
}: {
  tone: 'dim' | 'accent' | 'warm'
  children: React.ReactNode
}): React.ReactElement {
  return (
    <p
      className={cn(
        'text-[11px] leading-snug',
        tone === 'warm' ? 'text-glass-warm' : tone === 'accent' ? 'text-glass-accent2' : 'text-ink-600'
      )}
    >
      {children}
    </p>
  )
}
