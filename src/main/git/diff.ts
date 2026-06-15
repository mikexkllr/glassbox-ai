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

export async function listBranches(
  repoPath: string
): Promise<{ branches: string[]; current: string; defaultBase: string }> {
  const g = git(repoPath)
  const summary = await g.branchLocal()
  const branches = summary.all.filter((b) => !b.startsWith('remotes/'))
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

  let mergeBase: string | null = null
  try {
    mergeBase = (await g.raw(['merge-base', base, feature])).trim() || null
  } catch {
    mergeBase = null
  }

  // base...feature => changes on feature since it diverged from base.
  const range = mergeBase ? `${base}...${feature}` : `${base}..${feature}`
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
    mergeBase,
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0)
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

/** A compact textual rendering of the diff for the agent prompt. */
export function diffToText(diff: DiffSummary, maxFiles = 60): string {
  const out: string[] = []
  out.push(`Repository diff: ${diff.base}...${diff.feature}`)
  out.push(`${diff.files.length} files changed, +${diff.totalAdditions} -${diff.totalDeletions}`)
  out.push('')
  for (const f of diff.files.slice(0, maxFiles)) {
    out.push(`### ${f.kind.toUpperCase()} ${f.path}${f.oldPath ? ` (from ${f.oldPath})` : ''} (+${f.additions} -${f.deletions})`)
    if (f.binary) {
      out.push('(binary file)')
      continue
    }
    for (const h of f.hunks) {
      out.push(h.header)
      for (const l of h.lines) {
        const sign = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '
        const ln = l.newLine ?? l.oldLine ?? ''
        out.push(`${sign}${String(ln).padStart(5)}| ${l.content}`)
      }
    }
    out.push('')
  }
  return out.join('\n')
}

/** Just the hunks for one file, as text (used by the git_diff_context tool). */
export function fileDiffText(diff: DiffSummary, file: string): string {
  const f = diff.files.find((x) => x.path === file || x.oldPath === file)
  if (!f) return `No diff found for ${file}`
  const out: string[] = [`### ${f.kind.toUpperCase()} ${f.path} (+${f.additions} -${f.deletions})`]
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
