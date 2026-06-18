import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import type { PersistedSession } from '@shared/types'

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions')
}

function safeName(key: string): string {
  // Hash the full key so long repo paths or branch names can never be truncated
  // or sanitized into the same filename — which would serve the wrong cached
  // walkthrough for a different repo/branch.
  return crypto.createHash('sha1').update(key).digest('hex')
}

export async function loadSession(key: string): Promise<PersistedSession | null> {
  try {
    const raw = await fs.promises.readFile(path.join(sessionsDir(), safeName(key) + '.json'), 'utf8')
    return JSON.parse(raw) as PersistedSession
  } catch {
    return null
  }
}

export async function saveSession(session: PersistedSession): Promise<void> {
  await fs.promises.mkdir(sessionsDir(), { recursive: true })
  const file = path.join(sessionsDir(), safeName(session.key) + '.json')
  await fs.promises.writeFile(file, JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2), 'utf8')
}
