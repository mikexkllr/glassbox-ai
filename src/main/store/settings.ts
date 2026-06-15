import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

let cache: Settings | null = null

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  let result: Settings
  try {
    const raw = await fs.promises.readFile(configPath(), 'utf8')
    result = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    result = { ...DEFAULT_SETTINGS }
  }
  cache = result
  return result
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  cache = { ...DEFAULT_SETTINGS, ...settings }
  await fs.promises.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.promises.writeFile(configPath(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
