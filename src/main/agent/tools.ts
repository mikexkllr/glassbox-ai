import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import type { AgentEvent, DiffSummary, TrailEntry } from '@shared/types'
import { fileDiffText } from '../git/diff.js'

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'build', '.next', '.venv', '__pycache__'])
const MAX_FILE_BYTES = 200_000
const MAX_GREP_HITS = 60
const MAX_GLOB_HITS = 100

export interface InvestigationContext {
  diff: DiffSummary
  scope: string
  maxFiles: number
  emit: (e: AgentEvent) => void
}

export interface Investigation {
  // deepagents accepts StructuredTool[]; the precise generic shapes vary per tool.
  tools: any[]
  trail: TrailEntry[]
}

function insideRepo(repoRoot: string, rel: string): string | null {
  const resolved = path.resolve(repoRoot, rel)
  const root = path.resolve(repoRoot)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

function globToRegExp(glob: string): RegExp {
  // Minimal glob: ** -> any depth, * -> within segment, ? -> one char.
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') re += '[^/]'
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c
    else re += c
  }
  return new RegExp('^' + re + '$')
}

async function* walk(dir: string, root: string): AsyncGenerator<string> {
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue
      yield* walk(path.join(dir, e.name), root)
    } else if (e.isFile()) {
      yield path.relative(root, path.join(dir, e.name))
    }
  }
}

/**
 * Build the repo-scoped investigation toolset for one agent run.
 * Every call is sandboxed to the repo, recorded to `trail`, and streamed
 * to the renderer so the reader sees what Glassbox is reading, live.
 */
export function buildInvestigation(ctx: InvestigationContext): Investigation {
  const repoRoot = ctx.diff.repoPath
  const trail: TrailEntry[] = []
  const filesRead = new Set<string>()

  const record = (entry: TrailEntry) => {
    trail.push(entry)
    ctx.emit({ kind: 'tool', scope: ctx.scope, entry })
  }

  const readFile = tool(
    async ({ path: rel, startLine, endLine }) => {
      const abs = insideRepo(repoRoot, rel)
      if (!abs) return `Refused: "${rel}" is outside the repository.`
      if (!filesRead.has(rel) && filesRead.size >= ctx.maxFiles) {
        return `Investigation budget reached (${ctx.maxFiles} files). Summarize with what you already have, then call the submit tool.`
      }
      let content: string
      try {
        const stat = await fsp.stat(abs)
        if (stat.size > MAX_FILE_BYTES) return `File too large to read fully (${stat.size} bytes).`
        content = await fsp.readFile(abs, 'utf8')
      } catch (e) {
        return `Could not read "${rel}": ${(e as Error).message}`
      }
      filesRead.add(rel)
      record({ tool: 'read_file', target: rel, detail: startLine ? `lines ${startLine}-${endLine ?? '?'}` : undefined })
      const lines = content.split('\n')
      const from = startLine ? Math.max(1, startLine) : 1
      const to = endLine ? Math.min(lines.length, endLine) : lines.length
      const slice = lines.slice(from - 1, to)
      return slice.map((l, i) => `${from + i}\t${l}`).join('\n') || '(empty)'
    },
    {
      name: 'repo_read_file',
      description:
        'Read a file from the repository under review (the real checked-out code). Use this to follow imports, read type definitions, open tests, and understand context. Optionally pass startLine/endLine.',
      schema: z.object({
        path: z.string().describe('Repo-relative file path.'),
        startLine: z.number().int().optional(),
        endLine: z.number().int().optional()
      })
    }
  )

  const grep = tool(
    async ({ pattern, glob }) => {
      let re: RegExp
      try {
        re = new RegExp(pattern)
      } catch (e) {
        return `Invalid regex: ${(e as Error).message}`
      }
      const globRe = glob ? globToRegExp(glob) : null
      const hits: string[] = []
      for await (const rel of walk(repoRoot, repoRoot)) {
        if (globRe && !globRe.test(rel)) continue
        let text: string
        try {
          const abs = path.join(repoRoot, rel)
          if ((await fsp.stat(abs)).size > MAX_FILE_BYTES) continue
          text = await fsp.readFile(abs, 'utf8')
        } catch {
          continue
        }
        const ls = text.split('\n')
        for (let i = 0; i < ls.length; i++) {
          if (re.test(ls[i])) {
            hits.push(`${rel}:${i + 1}: ${ls[i].trim().slice(0, 200)}`)
            if (hits.length >= MAX_GREP_HITS) break
          }
        }
        if (hits.length >= MAX_GREP_HITS) break
      }
      record({ tool: 'grep', target: pattern, detail: glob ? `in ${glob}` : `${hits.length} hits` })
      return hits.length ? hits.join('\n') : `No matches for /${pattern}/.`
    },
    {
      name: 'repo_grep',
      description:
        'Search the repository for a regular expression (like ripgrep). Use it to find call sites, definitions, and usages. Optionally restrict to a glob (e.g. "src/**/*.ts").',
      schema: z.object({
        pattern: z.string().describe('JavaScript regular expression.'),
        glob: z.string().optional().describe('Optional path glob filter.')
      })
    }
  )

  const globTool = tool(
    async ({ pattern }) => {
      const globRe = globToRegExp(pattern)
      const hits: string[] = []
      for await (const rel of walk(repoRoot, repoRoot)) {
        if (globRe.test(rel)) hits.push(rel)
        if (hits.length >= MAX_GLOB_HITS) break
      }
      record({ tool: 'glob', target: pattern, detail: `${hits.length} files` })
      return hits.length ? hits.join('\n') : `No files match "${pattern}".`
    },
    {
      name: 'repo_glob',
      description: 'List repository files matching a glob pattern (e.g. "src/**/*.test.ts").',
      schema: z.object({ pattern: z.string() })
    }
  )

  const ls = tool(
    async ({ dir }) => {
      const abs = insideRepo(repoRoot, dir || '.')
      if (!abs) return `Refused: "${dir}" is outside the repository.`
      let entries: fs.Dirent[]
      try {
        entries = await fsp.readdir(abs, { withFileTypes: true })
      } catch (e) {
        return `Could not list "${dir}": ${(e as Error).message}`
      }
      record({ tool: 'ls', target: dir || '.' })
      return entries
        .filter((e) => !IGNORE_DIRS.has(e.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n')
    },
    {
      name: 'repo_ls',
      description: 'List the contents of a directory in the repository.',
      schema: z.object({ dir: z.string().describe('Repo-relative directory. Use "." for the root.') })
    }
  )

  const diffTool = tool(
    async ({ file }) => {
      record({ tool: 'diff', target: file })
      return fileDiffText(ctx.diff, file)
    },
    {
      name: 'repo_diff',
      description: 'Show the diff hunks for a single changed file (the actual change under review).',
      schema: z.object({ file: z.string().describe('Repo-relative path of a changed file.') })
    }
  )

  return { tools: [readFile, grep, globTool, ls, diffTool], trail }
}

/** A submit tool: the agent finishes a unit of work by *calling* this with structured args. */
export function makeSubmitTool<T>(
  name: string,
  description: string,
  schema: z.ZodType<T>,
  onSubmit: (value: T) => void
) {
  return tool(
    async (value: T) => {
      onSubmit(value)
      return 'Recorded. You are done — do not call any more tools.'
    },
    { name, description, schema: schema as any }
  )
}
