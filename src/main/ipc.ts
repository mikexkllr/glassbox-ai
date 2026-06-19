import { ipcMain, dialog, BrowserWindow } from 'electron'
import type {
  AgentEvent,
  ChatMessage,
  CodeAnchor,
  DiffSummary,
  PersistedSession,
  ReviewDecision,
  Settings,
  SectionPlan
} from '@shared/types'
import { listBranches, computeDiff, showFile } from './git/diff.js'
import { getSettings, saveSettings } from './store/settings.js'
import { loadSession, saveSession } from './store/cache.js'
import { makeModel } from './agent/model.js'
import {
  generateOverview,
  generateSection,
  askWhy,
  chat,
  explainDeeper,
  scoreAnswer,
  assessFinding,
  generateReview
} from './agent/agent.js'

function emitter(): (e: AgentEvent) => void {
  return (e) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('agent:event', e)
    }
  }
}

export function registerIpc(): void {
  ipcMain.handle('repo:pick', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a git repository',
      properties: ['openDirectory']
    })
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
  })

  ipcMain.handle('repo:branches', async (_e, repoPath: string) => listBranches(repoPath))

  ipcMain.handle('repo:diff', async (_e, repoPath: string, base: string, feature: string) =>
    computeDiff(repoPath, base, feature)
  )

  ipcMain.handle('repo:file', async (_e, repoPath: string, ref: string, file: string) =>
    showFile(repoPath, ref, file)
  )

  ipcMain.handle('settings:get', async () => getSettings())
  ipcMain.handle('settings:save', async (_e, s: Settings) => saveSettings(s))
  ipcMain.handle('ollama:models', async (_e, baseUrl: string) => {
    try {
      const url = (baseUrl || 'http://localhost:11434').replace(/\/$/, '') + '/api/tags'
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return { ok: false, models: [], message: `HTTP ${res.status}` }
      const data = (await res.json()) as { models?: { name: string }[] }
      return { ok: true, models: (data.models ?? []).map((m) => m.name).sort() }
    } catch (e) {
      return { ok: false, models: [], message: (e as Error).message }
    }
  })

  ipcMain.handle('settings:test', async () => {
    try {
      const model = await makeModel(await getSettings())
      const res = await model.invoke('Reply with the single word: ready')
      const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
      return { ok: true, message: `Model responded: ${text.slice(0, 80)}` }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  })

  ipcMain.handle('agent:overview', async (_e, diff: DiffSummary) => generateOverview(diff, emitter()))
  ipcMain.handle('agent:section', async (_e, diff: DiffSummary, plan: SectionPlan) =>
    generateSection(diff, plan, emitter())
  )
  ipcMain.handle('agent:why', async (_e, diff: DiffSummary, question: string, context: string) =>
    askWhy(diff, question, context, emitter())
  )
  ipcMain.handle('agent:deeper', async (_e, diff: DiffSummary, anchor: CodeAnchor, current: string) =>
    explainDeeper(diff, anchor, current, emitter())
  )
  ipcMain.handle('agent:chat', async (_e, diff: DiffSummary, history: ChatMessage[], question: string, context?: string) =>
    chat(diff, history, question, emitter(), context)
  )
  ipcMain.handle(
    'agent:score',
    async (_e, diff: DiffSummary, question: string, reference: string, userAnswer: string) =>
      scoreAnswer(diff, question, reference, userAnswer, emitter())
  )
  ipcMain.handle('agent:assess', async (_e, diff: DiffSummary, anchor: CodeAnchor, note: string) =>
    assessFinding(diff, anchor, note, emitter())
  )
  ipcMain.handle('agent:review', async (_e, diff: DiffSummary, decision: ReviewDecision, notes: string) =>
    generateReview(diff, decision, notes, emitter())
  )

  ipcMain.handle('session:load', async (_e, key: string) => loadSession(key))
  ipcMain.handle('session:save', async (_e, session: PersistedSession) => saveSession(session))
}
