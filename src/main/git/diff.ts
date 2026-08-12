import { simpleGit, type SimpleGit } from 'simple-git'
import parseDiff from 'parse-diff'
import type {
  BranchInfo,
  BranchList,
  DiffSummary,
  DiffFile,
  DiffHunk,
  DiffLine,
  FileChangeKind
} from '@shared/types'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', sh: 'bash', bash: 'bash', vue: 'vue'
}

function langFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'text'
}

function git(repoPath: string): SimpleGit {
  return simpleGit({ baseDir: repoPath, maxConcurrentProcesses: 4 })
}

/**
 * Update remote-tracking refs before we read branches/diffs, so a PR branch
 * that moved on `origin` (or only exists there) is visible. `fetch` only
 * touches remote-tracking refs — never the user's local branches or working
 * tree — so this can't clobber a dirty checkout. Best-effort: repos with no
 * remote, or no network, just fall back to whatever refs are already local.
 */
async function fetchAll(g: SimpleGit): Promise<string | null> {
  try {
    await g.fetch(['--all', '--prune'])
    return null
  } catch (e) {
    const message = (e as Error).message
    console.warn(`[glassbox] git fetch failed, using local refs: ${message}`)
    return message
  }
}

/**
 * Resolve `ref` to a commit SHA, preferring `origin/<ref>` over a local
 * branch of the same name when the local branch is behind (a fast-forward) —
 * so a branch the user selected but never manually pulled still resolves to
 * what's actually on origin post-fetch. Never touches the working tree or
 * moves the local branch pointer; if the local branch is ahead or has
 * diverged (the user's own unpushed work), the local ref wins.
 */
async function resolveFreshRef(g: SimpleGit, ref: string): Promise<string> {
  const local = await (async () => {
    try {
      return (await g.revparse([ref])).trim()
    } catch {
      return ''
    }
  })()
  // Only a *local branch* can have a same-named remote-tracking counterpart
  // worth comparing — an `origin/...` ref, a raw sha or `HEAD` cannot. Testing
  // for a slash instead would exclude every `feature/x` branch, i.e. most of
  // them. `for-each-ref` exits 0 and prints nothing when nothing matches, so
  // there's no exit-code ambiguity to fall foul of.
  if (!local || ref === 'HEAD') return local
  try {
    const asLocalBranch = await g.raw(['for-each-ref', '--format=%(refname)', `refs/heads/${ref}`])
    if (!asLocalBranch.trim()) return local
  } catch {
    return local
  }

  let remote = ''
  try {
    remote = (await g.revparse([`origin/${ref}`])).trim()
  } catch {
    return local // no remote counterpart (e.g. a local-only branch)
  }
  if (!remote || remote === local) return local

  // `--is-ancestor` signals "no" via a bare non-zero exit with no stderr, which
  // simple-git's default error detection (exitCode && stderr) doesn't treat as
  // a failure — it would resolve "true" either way. Comparing merge-base's
  // printed SHA sidesteps that: local is a fast-forward behind remote only if
  // their common ancestor *is* local.
  let mergeBase = ''
  try {
    mergeBase = (await g.raw(['merge-base', local, remote])).trim()
  } catch {
    return local // unrelated histories or other failure — don't guess
  }
  return mergeBase === local ? remote : local
}

/** Field separator for `for-each-ref` output — safe inside commit subjects. */
const REF_SEP = '\x1f'
const REF_FORMAT = [
  '%(refname)',
  '%(objectname)',
  '%(committerdate:unix)',
  '%(HEAD)',
  '%(upstream:short)',
  '%(contents:subject)'
].join(REF_SEP)

/**
 * Ahead/behind is one git process per branch, so only ask when the answer can
 * be non-zero (tips differ) and stop after this many — a repo with hundreds of
 * stale branches shouldn't stall the picker. Uncompared branches simply show no
 * divergence badge.
 */
const MAX_AHEAD_BEHIND = 60

async function aheadBehind(
  g: SimpleGit,
  local: string,
  upstream: string
): Promise<{ ahead: number; behind: number }> {
  try {
    // `--left-right --count A...B` prints "<only in A>\t<only in B>".
    const out = await g.raw(['rev-list', '--left-right', '--count', `${local}...${upstream}`])
    const [ahead, behind] = out.trim().split(/\s+/).map((n) => Number(n) || 0)
    return { ahead: ahead ?? 0, behind: behind ?? 0 }
  } catch {
    return { ahead: 0, behind: 0 } // unrelated histories, missing ref — don't guess
  }
}

/**
 * Enumerate every local and remote-tracking branch, each annotated with its tip
 * commit and — for local branches — how far it has drifted from its remote
 * counterpart. The picker needs all of it up front: which refs exist on both
 * sides, which local branch is behind origin, and how stale each one is.
 *
 * `doFetch` is opt-out because fetching a large repo takes seconds; the UI
 * lists local refs instantly first, then re-lists once the fetch lands.
 */
export async function listBranches(repoPath: string, doFetch = true): Promise<BranchList> {
  const g = git(repoPath)
  const fetchError = doFetch ? await fetchAll(g) : null

  const raw = await g.raw(['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes'])

  const locals: BranchInfo[] = []
  const remotes: BranchInfo[] = []
  let current = ''

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const [refname, sha, committed, head, upstream, ...subjectParts] = line.split(REF_SEP)
    // `origin/HEAD` is a symref alias for the remote's default branch, not a
    // branch of its own — listing it would duplicate e.g. `origin/main`.
    if (!refname || refname.endsWith('/HEAD')) continue

    const isLocal = refname.startsWith('refs/heads/')
    const name = refname.replace(/^refs\/(heads|remotes)\//, '')
    const remote = isLocal ? null : name.slice(0, name.indexOf('/'))
    const info: BranchInfo = {
      name,
      short: isLocal ? name : name.slice(name.indexOf('/') + 1),
      kind: isLocal ? 'local' : 'remote',
      remote,
      current: head === '*',
      sha,
      subject: subjectParts.join(REF_SEP),
      committedAt: (Number(committed) || 0) * 1000,
      upstream: isLocal ? upstream || null : null,
      ahead: 0,
      behind: 0
    }
    if (info.current) current = name
    ;(isLocal ? locals : remotes).push(info)
  }

  const remoteByName = new Map(remotes.map((r) => [r.name, r]))
  const localNames = new Set(locals.map((l) => l.name))
  for (const r of remotes) r.hasLocal = localNames.has(r.short)

  // Compare each local branch against its configured upstream, falling back to
  // a same-named `origin/<branch>` — that fallback is what `resolveFreshRef`
  // uses when computing the diff, so the badge matches what actually gets read.
  const pending: BranchInfo[] = []
  for (const l of locals) {
    const counterpart =
      (l.upstream && remoteByName.get(l.upstream)) || remoteByName.get(`origin/${l.name}`) || null
    if (!counterpart) {
      l.upstream = null
      continue
    }
    l.upstream = counterpart.name
    if (counterpart.sha !== l.sha) pending.push(l)
  }

  const compared = pending
    .sort((a, b) => b.committedAt - a.committedAt)
    .slice(0, MAX_AHEAD_BEHIND)
  await Promise.all(
    compared.map(async (l) => {
      const { ahead, behind } = await aheadBehind(g, l.sha, remoteByName.get(l.upstream!)!.sha)
      l.ahead = ahead
      l.behind = behind
    })
  )

  // Current branch first, then most-recently-committed — the branches someone
  // actually wants to diff are nearly always the ones touched last.
  const byRecency = (a: BranchInfo, b: BranchInfo): number => b.committedAt - a.committedAt
  const branches = [
    ...locals.filter((l) => l.current),
    ...locals.filter((l) => !l.current).sort(byRecency),
    ...remotes.sort(byRecency)
  ]

  const names = branches.map((b) => b.name)
  // Prefer main/master/develop as the default base.
  const defaultBase =
    ['main', 'master', 'develop', 'trunk'].find((b) => names.includes(b)) ??
    names.find((b) => b !== current) ??
    current

  return {
    branches,
    current,
    defaultBase,
    fetched: doFetch && !fetchError,
    fetchError,
    fetchedAt: Date.now()
  }
}

function kindFor(f: parseDiff.File): FileChangeKind {
  if (f.new) return 'added'
  if (f.deleted) return 'deleted'
  if (f.from && f.to && f.from !== f.to) return 'renamed'
  return 'modified'
}

function cleanPath(p: string | undefined): string | null {
  if (!p || p === '/dev/null') return null
  return p.replace(/^([ab])\//, '')
}

function toHunks(f: parseDiff.File): DiffHunk[] {
  return f.chunks.map((chunk) => {
    const lines: DiffLine[] = chunk.changes.map((c) => {
      if (c.type === 'add') {
        return { type: 'add', content: c.content.slice(1), oldLine: null, newLine: (c as any).ln }
      }
      if (c.type === 'del') {
        return { type: 'del', content: c.content.slice(1), oldLine: (c as any).ln, newLine: null }
      }
      return {
        type: 'context',
        content: c.content.slice(1),
        oldLine: (c as any).ln1 ?? null,
        newLine: (c as any).ln2 ?? null
      }
    })
    return {
      header: chunk.content,
      oldStart: chunk.oldStart,
      oldLines: chunk.oldLines,
      newStart: chunk.newStart,
      newLines: chunk.newLines,
      lines
    }
  })
}

export async function computeDiff(
  repoPath: string,
  base: string,
  feature: string
): Promise<DiffSummary> {
  const g = git(repoPath)
  await fetchAll(g)

  // Pin the exact endpoint commits so the cache key — and the diff itself —
  // reflect the real, freshest content, not a (possibly stale, un-pulled)
  // local branch pointer.
  const [baseSha, featureSha] = await Promise.all([resolveFreshRef(g, base), resolveFreshRef(g, feature)])

  let mergeBase: string | null = null
  try {
    mergeBase = (await g.raw(['merge-base', baseSha, featureSha])).trim() || null
  } catch {
    mergeBase = null
  }

  // base...feature => changes on feature since it diverged from base.
  const range = mergeBase ? `${baseSha}...${featureSha}` : `${baseSha}..${featureSha}`
  const raw = await g.raw(['diff', '--no-color', '-M', range])

  const parsed = parseDiff(raw)
  const files: DiffFile[] = parsed.map((f) => {
    const newPath = cleanPath(f.to)
    const oldPath = cleanPath(f.from)
    const path = newPath ?? oldPath ?? 'unknown'
    return {
      path,
      oldPath: oldPath && oldPath !== path ? oldPath : null,
      kind: kindFor(f),
      language: langFor(path),
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      binary: Boolean((f as any).binary),
      hunks: toHunks(f)
    }
  })

  return {
    repoPath,
    base,
    feature,
    baseSha,
    featureSha,
    mergeBase,
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0)
  }
}

/**
 * A "diff" for a topic journey: no changed files, both endpoints pinned to a
 * single ref. The topic question rides along so the agent, the cache key, and
 * the UI all know what the journey is about. Reusing the DiffSummary shape
 * keeps the whole downstream pipeline (worktrees, sections, sessions) working
 * unchanged.
 *
 * `branch` lets the caller pin the snapshot to a specific (freshly-fetched)
 * branch instead of whatever happens to be checked out locally — otherwise a
 * stale local HEAD would silently answer questions against old code.
 */
export async function computeTopicSnapshot(
  repoPath: string,
  topic: string,
  branch?: string
): Promise<DiffSummary> {
  const g = git(repoPath)
  await fetchAll(g)

  let ref = branch?.trim() || ''
  if (!ref) {
    try {
      ref = (await g.revparse(['--abbrev-ref', 'HEAD'])).trim()
    } catch {
      ref = ''
    }
  }
  const sha = ref ? await resolveFreshRef(g, ref) : (await g.revparse(['HEAD'])).trim()
  if (!ref || ref === 'HEAD') ref = sha

  return {
    repoPath,
    base: ref,
    feature: ref,
    baseSha: sha,
    featureSha: sha,
    mergeBase: null,
    mode: 'topic',
    topic: topic.trim(),
    files: [],
    totalAdditions: 0,
    totalDeletions: 0
  }
}

/** Read a file's content at a given ref (e.g. the feature branch), for rendering pokeable code. */
export async function showFile(repoPath: string, ref: string, file: string): Promise<string> {
  const g = git(repoPath)
  try {
    return await g.show([`${ref}:${file}`])
  } catch {
    return ''
  }
}

function fileHeader(f: DiffFile): string {
  return `### ${f.kind.toUpperCase()} ${f.path}${f.oldPath ? ` (from ${f.oldPath})` : ''} (+${f.additions} -${f.deletions})`
}

function hunksText(f: DiffFile): string {
  const out: string[] = []
  for (const h of f.hunks) {
    out.push(h.header)
    for (const l of h.lines) {
      const sign = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '
      const ln = l.newLine ?? l.oldLine ?? ''
      out.push(`${sign}${String(ln).padStart(5)}| ${l.content}`)
    }
  }
  return out.join('\n')
}

/**
 * A compact textual rendering of the whole diff for the agent prompt.
 *
 * Large PRs used to either silently drop files past a fixed count or dump every
 * hunk and blow the context window (the model then hallucinates the rest). So:
 * we ALWAYS list every changed file's header up front (the planner must see the
 * full scope), then spend a character budget inlining hunk bodies — biggest
 * files capped per-file so one giant file can't starve the others. Anything not
 * inlined is reachable via the repo_diff tool.
 */
export function diffToText(diff: DiffSummary, maxChars = 24_000, perFileMax = 6_000): string {
  const out: string[] = []
  out.push(`Repository diff: ${diff.base}...${diff.feature}`)
  out.push(`${diff.files.length} files changed, +${diff.totalAdditions} -${diff.totalDeletions}`)
  out.push('')

  const bodies: string[] = []
  let budget = maxChars
  let omitted = 0

  for (const f of diff.files) {
    const header = fileHeader(f)
    if (f.binary) {
      bodies.push(`${header}\n(binary file)`, '')
      continue
    }
    let body = `${header}\n${hunksText(f)}`
    if (body.length > perFileMax) {
      body = `${body.slice(0, perFileMax)}\n… (${f.path} diff truncated — use repo_diff("${f.path}") for the full hunks)`
    }
    if (body.length <= budget) {
      bodies.push(body, '')
      budget -= body.length
    } else {
      omitted++
    }
  }

  // If we couldn't inline every file, give the planner the complete file list so
  // nothing in the change is invisible, then the hunks that fit.
  if (omitted > 0) {
    out.push(`All ${diff.files.length} changed files:`)
    for (const f of diff.files) out.push(fileHeader(f) + (f.binary ? ' (binary)' : ''))
    out.push('')
    out.push(`Inlining the hunks that fit a size budget below; ${omitted} file(s)' hunks were omitted — read any with repo_diff(file).`)
    out.push('')
  }
  out.push(...bodies)
  return out.join('\n').trim()
}

/** Just the hunks for one file, as text (used by the repo_diff tool + section prompts). */
export function fileDiffText(diff: DiffSummary, file: string, maxChars = 16_000): string {
  const f = diff.files.find((x) => x.path === file || x.oldPath === file)
  if (!f) return `No diff found for ${file}`
  if (f.binary) return `${fileHeader(f)}\n(binary file)`
  const text = `${fileHeader(f)}\n${hunksText(f)}`
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n… (diff truncated — read the file directly with repo_read_file for the rest)`
    : text
}
