import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PersistedSession } from '@shared/types'

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions')
}

function safeName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200)
}

export function sessionKey(repoPath: string, base: string, feature: string): string {
  return `${repoPath}::${base}::${feature}`
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
