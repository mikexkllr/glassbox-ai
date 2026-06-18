import { app } from 'electron'
import { simpleGit } from 'simple-git'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

/**
 * Isolated feature-branch checkouts for the agent.
 *
 * The investigation tools must read the *feature* version of every file, not
 * whatever the user happens to have checked out (or left dirty) in their main
 * working copy — otherwise the agent explains code that doesn't match the diff
 * (the new-side line numbers) or the code rendered in the UI. We give it a
 * detached `git worktree` pinned to the feature commit so reads are always the
 * real reviewed code, and we never disturb the user's working tree.
 */

// key (repoPath+sha) -> resolved worktree path. De-dupes concurrent callers
// (parallel section prefetch would otherwise race `git worktree add`).
const inflight = new Map<string, Promise<string>>()
// worktree dir -> parent repo, so we can `git worktree remove` on quit.
const created = new Map<string, string>()

function rootDir(): string {
  return path.join(app.getPath('userData'), 'worktrees')
}

function keyFor(repoPath: string, sha: string): string {
  return crypto.createHash('sha1').update(`${repoPath}\0${sha}`).digest('hex').slice(0, 16)
}

/**
 * Ensure a detached worktree of `repoPath` pinned to the `feature` commit, and
 * return its absolute path. Cached per (repo, commit). Degrades to the live
 * working tree if a worktree can't be created (bare repo, disk, perms…), so the
 * agent keeps working rather than hard-failing.
 */
export async function ensureWorktree(repoPath: string, feature: string): Promise<string> {
  const g = simpleGit({ baseDir: repoPath })

  let sha: string
  try {
    sha = (await g.revparse([feature])).trim()
  } catch {
    return repoPath // can't resolve the ref — read the working tree as a fallback
  }
  if (!sha) return repoPath

  const key = keyFor(repoPath, sha)
  const existing = inflight.get(key)
  if (existing) return existing

  const make = (async (): Promise<string> => {
    const dest = path.join(rootDir(), key)
    try {
      // A worktree's ".git" is a gitdir-pointer file; if it's present the
      // checkout from a previous run this session is reusable.
      await fsp.access(path.join(dest, '.git'))
      created.set(dest, repoPath)
      return dest
    } catch {
      // not a valid worktree (missing or partial) — fall through to (re)create
    }
    try {
      await fsp.rm(dest, { recursive: true, force: true }) // clear any stale/partial dir
      await fsp.mkdir(rootDir(), { recursive: true })
      await g.raw(['worktree', 'prune'])
      await g.raw(['worktree', 'add', '--detach', '--force', dest, sha])
      created.set(dest, repoPath)
      return dest
    } catch (e) {
      console.warn(`[glassbox] worktree add failed, reading working tree instead: ${(e as Error).message}`)
      return repoPath
    }
  })()

  inflight.set(key, make)
  const result = await make
  // Don't cache a fallback to the working tree — allow a later retry to succeed.
  if (result === repoPath) inflight.delete(key)
  return result
}

/** Remove every worktree we created this run. Best-effort; call on quit. */
export async function cleanupWorktrees(): Promise<void> {
  for (const [dest, repoPath] of created) {
    try {
      await simpleGit({ baseDir: repoPath }).raw(['worktree', 'remove', '--force', dest])
    } catch {
      try {
        await fsp.rm(dest, { recursive: true, force: true })
        await simpleGit({ baseDir: repoPath }).raw(['worktree', 'prune'])
      } catch {
        /* give up quietly */
      }
    }
  }
  created.clear()
  inflight.clear()
}

/**
 * Delete the whole worktree cache directory. Run once at startup to reclaim disk
 * from worktrees orphaned by a crash/force-quit; their now-dangling git
 * registrations are cleared by the `worktree prune` in {@link ensureWorktree}.
 */
export async function purgeWorktreeRoot(): Promise<void> {
  try {
    await fsp.rm(rootDir(), { recursive: true, force: true })
  } catch {
    /* nothing to purge */
  }
}
