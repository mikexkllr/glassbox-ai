import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentEvent,
  ChatMessage,
  CodeAnchor,
  DiffSummary,
  GlassboxApi,
  PersistedSession,
  SectionPlan,
  Settings
} from '@shared/types'

const api: GlassboxApi = {
  pickRepo: () => ipcRenderer.invoke('repo:pick'),
  listBranches: (repoPath) => ipcRenderer.invoke('repo:branches', repoPath),
  computeDiff: (repoPath, base, feature) => ipcRenderer.invoke('repo:diff', repoPath, base, feature),
  readFileContent: (repoPath, ref, file) => ipcRenderer.invoke('repo:file', repoPath, ref, file),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('settings:save', s),
  testModel: () => ipcRenderer.invoke('settings:test'),

  generateOverview: (diff: DiffSummary) => ipcRenderer.invoke('agent:overview', diff),
  generateSection: (diff: DiffSummary, plan: SectionPlan) => ipcRenderer.invoke('agent:section', diff, plan),
  askWhy: (diff: DiffSummary, question: string, context: string) =>
    ipcRenderer.invoke('agent:why', diff, question, context),
  explainDeeper: (diff: DiffSummary, anchor: CodeAnchor, current: string) =>
    ipcRenderer.invoke('agent:deeper', diff, anchor, current),
  chat: (diff: DiffSummary, history: ChatMessage[], question: string) =>
    ipcRenderer.invoke('agent:chat', diff, history, question),

  loadSession: (key: string) => ipcRenderer.invoke('session:load', key),
  saveSession: (session: PersistedSession) => ipcRenderer.invoke('session:save', session),

  onAgentEvent: (cb: (event: AgentEvent) => void) => {
    const listener = (_e: unknown, event: AgentEvent) => cb(event)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  }
}

contextBridge.exposeInMainWorld('glassbox', api)
