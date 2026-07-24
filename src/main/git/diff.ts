import { simpleGit, type SimpleGit } from 'simple-git'
import parseDiff from 'parse-diff'
import type {
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
async function fetchAll(g: SimpleGit): Promise<void> {
  try {
    await g.fetch(['--all', '--prune'])
  } catch (e) {
    console.warn(`[glassbox] git fetch failed, using local refs: ${(e as Error).message}`)
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
  // Only a bare branch name (not already `origin/...`, a raw sha, or `HEAD`)
  // can have a same-named remote-tracking counterpart worth comparing.
  if (!local || ref.includes('/') || ref === 'HEAD') return local

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

export async function listBranches(
  repoPath: string
): Promise<{ branches: string[]; current: string; defaultBase: string }> {
  const g = git(repoPath)
  await fetchAll(g)
  const summary = await g.branch(['-a'])
  const local = summary.all.filter((b) => !b.startsWith('remotes/'))
  // Surface remote-only branches (e.g. a PR never checked out locally) as
  // `origin/foo`, deduped against any local branch of the same name.
  const remote = summary.all
    .filter((b) => b.startsWith('remotes/') && !b.endsWith('/HEAD'))
    .map((b) => b.slice('remotes/'.length))
    .filter((b) => !local.includes(b.slice(b.indexOf('/') + 1)))
  const branches = [...local, ...remote]
  const current = summary.current
  // Prefer main/master/develop as the default base.
  const defaultBase =
    ['main', 'master', 'develop', 'trunk'].find((b) => branches.includes(b)) ??
    branches.find((b) => b !== current) ??
    current
  return { branches, current, defaultBase }
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
