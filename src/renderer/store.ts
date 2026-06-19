import { create } from 'zustand'
import type {
  AgentEvent,
  ChatMessage,
  DiffSummary,
  Overview,
  ScoreResult,
  SectionPlan,
  Settings,
  TrailEntry,
  UserFinding,
  WalkthroughSection
} from '@shared/types'

export interface SelfCheckResult {
  guess: string
  score: ScoreResult
}

export type Depth = 'gist' | 'deep'
export type ViewMode = 'guided' | 'presentation' | 'scroll'

export interface LiveScope {
  status: string
  trail: TrailEntry[]
  busy: boolean
  error?: string
}

interface ActiveTrace {
  sectionId: string
  valueId: string
}

interface State {
  // navigation
  screen: 'onboarding' | 'walkthrough'
  settingsOpen: boolean
  chatOpen: boolean

  // repo selection
  repoPath: string | null
  branches: string[]
  base: string
  feature: string
  busyDiff: boolean

  // settings
  settings: Settings | null

  // walkthrough data
  diff: DiffSummary | null
  overview: Overview | null
  sections: Record<string, WalkthroughSection>
  walked: string[]
  findings: UserFinding[]

  // interaction state
  depth: Depth
  viewMode: ViewMode
  slideIndex: number // 0 = overview, 1..N = sections[n-1]
  activeTrace: ActiveTrace | null
  selfCheckRevealed: string[] // chunk/section ids revealed
  selfCheckResults: Record<string, SelfCheckResult> // persisted per section across nav
  openSections: Record<string, boolean>

  // live agent telemetry, keyed by scope (section id, "overview", "chat", ...)
  live: Record<string, LiveScope>

  // chat
  chatHistory: ChatMessage[]
  chatBusy: boolean
  /** What the user is currently looking at, threaded into Ask so "this/here" resolves. */
  chatContext: string | null

  error: string | null

  // actions
  init: () => Promise<void>
  setSettings: (s: Settings) => void
  saveSettings: (s: Settings) => Promise<void>
  openSettings: (open: boolean) => void

  pickRepo: () => Promise<void>
  setBase: (b: string) => void
  setFeature: (f: string) => void
  startWalkthrough: () => Promise<void>
  backToOnboarding: () => void
  regenerate: () => Promise<void>
  resetAll: () => void

  ensureOverview: () => Promise<void>
  ensureSection: (plan: SectionPlan) => Promise<void>
  markWalked: (id: string) => void
  setSelfCheckResult: (sectionId: string, result: SelfCheckResult) => void
  setSectionOpen: (id: string, open: boolean) => void
  setViewMode: (m: ViewMode) => void
  setSlide: (n: number) => void
  setDepth: (d: Depth) => void
  setActiveTrace: (t: ActiveTrace | null) => void
  revealSelfCheck: (id: string) => void

  setChatOpen: (open: boolean) => void
  setChatContext: (ctx: string | null) => void
  sendChat: (q: string) => Promise<void>

  addFinding: (f: UserFinding) => void

  handleAgentEvent: (e: AgentEvent) => void
}

function sessionKeyOf(diff: DiffSummary): string {
  // Bind the cached walkthrough to the exact endpoint commits, not just the
  // (movable) branch names — so moving or switching a branch yields a fresh
  // walkthrough instead of re-serving a stale or cross-loaded one.
  return `${diff.repoPath}::${diff.base}::${diff.feature}::${diff.baseSha}::${diff.featureSha}`
}

function persist(get: () => State) {
  const s = get()
  if (!s.diff) return
  const key = sessionKeyOf(s.diff)
  window.glassbox.saveSession({
    key,
    repoPath: s.repoPath!,
    base: s.base,
    feature: s.feature,
    overview: s.overview ?? undefined,
    sections: s.sections,
    walked: s.walked,
    findings: s.findings,
    updatedAt: Date.now()
  })
}

export const useStore = create<State>((set, get) => ({
  screen: 'onboarding',
  settingsOpen: false,
  chatOpen: false,

  repoPath: null,
  branches: [],
  base: '',
  feature: '',
  busyDiff: false,

  settings: null,

  diff: null,
  overview: null,
  sections: {},
  walked: [],
  findings: [],

  depth: 'deep',
  viewMode: 'guided',
  slideIndex: 0,
  activeTrace: null,
  selfCheckRevealed: [],
  selfCheckResults: {},
  openSections: {},

  live: {},

  chatHistory: [],
  chatBusy: false,
  chatContext: null,

  error: null,

  async init() {
    const settings = await window.glassbox.getSettings()
    set({ settings })
  },

  setSettings(s) {
    set({ settings: s })
  },
  async saveSettings(s) {
    const saved = await window.glassbox.saveSettings(s)
    set({ settings: saved })
  },
  openSettings(open) {
    set({ settingsOpen: open })
  },

  async pickRepo() {
    const repoPath = await window.glassbox.pickRepo()
    if (!repoPath) return
    set({ repoPath, error: null })
    try {
      const { branches, current, defaultBase } = await window.glassbox.listBranches(repoPath)
      set({ branches, feature: current, base: defaultBase })
    } catch (e) {
      set({ error: `Not a git repo or no branches: ${(e as Error).message}` })
    }
  },

  setBase(b) {
    set({ base: b })
  },
  setFeature(f) {
    set({ feature: f })
  },

  async startWalkthrough() {
    const { repoPath, base, feature } = get()
    if (!repoPath || !base || !feature) return
    if (base === feature) {
      set({ error: 'Pick two different branches (base and feature).' })
      return
    }
    set({ busyDiff: true, error: null })
    try {
      const diff = await window.glassbox.computeDiff(repoPath, base, feature)
      if (diff.files.length === 0) {
        set({ busyDiff: false, error: `No changes between ${base} and ${feature}.` })
        return
      }
      // Try restoring a saved session (keyed by the exact commits in this diff).
      const key = sessionKeyOf(diff)
      const saved = await window.glassbox.loadSession(key)
      set({
        diff,
        screen: 'walkthrough',
        busyDiff: false,
        overview: saved?.overview ?? null,
        sections: saved?.sections ?? {},
        walked: saved?.walked ?? [],
        findings: saved?.findings ?? [],
        live: {},
        chatHistory: [],
        openSections: {},
        slideIndex: 0,
        selfCheckResults: {}
      })
      if (!get().overview) {
        await get().ensureOverview()
      }
    } catch (e) {
      set({ busyDiff: false, error: (e as Error).message })
    }
  },

  // not in the public interface but used internally
  async ensureOverview() {
    const { diff } = get()
    if (!diff) return
    set((s) => ({ live: { ...s.live, overview: { status: 'Starting…', trail: [], busy: true } } }))
    try {
      const overview = await window.glassbox.generateOverview(diff)
      set({ overview })
      persist(get)
    } catch (e) {
      set((s) => ({
        live: { ...s.live, overview: { ...(s.live.overview ?? { status: '', trail: [] }), busy: false, error: (e as Error).message } }
      }))
    }
  },

  backToOnboarding() {
    set({ screen: 'onboarding', diff: null, overview: null, sections: {}, walked: [], findings: [], live: {}, chatHistory: [], chatContext: null, openSections: {}, slideIndex: 0, selfCheckResults: {} })
  },

  // Discard the cached AI walkthrough for the current branches and re-run it.
  async regenerate() {
    if (!get().diff) return
    set({ overview: null, sections: {}, walked: [], findings: [], live: {}, chatHistory: [], openSections: {}, slideIndex: 0, selfCheckResults: {} })
    persist(get) // overwrite the cached session so a reopen also regenerates
    await get().ensureOverview()
  },

  // Full clean slate: wipe the cached walkthrough for these branches, then
  // return to onboarding. (The game profile is reset separately by the caller.)
  resetAll() {
    if (get().diff) {
      set({ overview: null, sections: {}, walked: [], findings: [] })
      persist(get)
    }
    get().backToOnboarding()
  },

  async ensureSection(plan) {
    const { sections, live, diff } = get()
    if (!diff) return
    if (sections[plan.id]) return
    if (live[plan.id]?.busy) return
    set((s) => ({ live: { ...s.live, [plan.id]: { status: 'Starting…', trail: [], busy: true } } }))
    try {
      const section = await window.glassbox.generateSection(diff, plan)
      set((s) => ({ sections: { ...s.sections, [plan.id]: section } }))
      persist(get)
    } catch (e) {
      set((s) => ({
        live: {
          ...s.live,
          [plan.id]: { ...(s.live[plan.id] ?? { status: '', trail: [] }), busy: false, error: (e as Error).message }
        }
      }))
    }
  },

  markWalked(id) {
    set((s) => (s.walked.includes(id) ? s : { walked: [...s.walked, id] }))
    persist(get)
  },

  setSelfCheckResult(sectionId, result) {
    set((s) => ({ selfCheckResults: { ...s.selfCheckResults, [sectionId]: result } }))
  },

  setSectionOpen(id, open) {
    set((s) => ({ openSections: { ...s.openSections, [id]: open } }))
  },

  setViewMode(m) {
    set({ viewMode: m })
  },
  setSlide(n) {
    const count = (get().overview?.sections.length ?? 0) + 1
    set({ slideIndex: Math.max(0, Math.min(count - 1, n)) })
  },

  setDepth(d) {
    set({ depth: d })
  },
  setActiveTrace(t) {
    set({ activeTrace: t })
  },
  revealSelfCheck(id) {
    set((s) => (s.selfCheckRevealed.includes(id) ? s : { selfCheckRevealed: [...s.selfCheckRevealed, id] }))
  },

  setChatOpen(open) {
    set({ chatOpen: open })
  },
  setChatContext(ctx) {
    set({ chatContext: ctx })
  },

  addFinding(f) {
    set((s) => ({ findings: [...s.findings, f] }))
    persist(get)
  },

  async sendChat(q) {
    const { diff, chatHistory, chatContext } = get()
    if (!diff || !q.trim()) return
    const history = [...chatHistory, { role: 'user' as const, content: q }]
    set({ chatHistory: history, chatBusy: true })
    set((s) => ({ live: { ...s.live, chat: { status: 'Looking into it…', trail: [], busy: true } } }))
    try {
      const { answer, trail } = await window.glassbox.chat(diff, chatHistory, q, chatContext ?? undefined)
      set((s) => ({
        chatHistory: [...s.chatHistory, { role: 'assistant', content: answer, trail }],
        chatBusy: false
      }))
    } catch (e) {
      set((s) => ({
        chatHistory: [...s.chatHistory, { role: 'assistant', content: `Sorry — ${(e as Error).message}` }],
        chatBusy: false
      }))
    }
  },

  handleAgentEvent(e) {
    set((s) => {
      const cur = s.live[e.scope] ?? { status: '', trail: [], busy: true }
      const next: LiveScope = { ...cur }
      if (e.kind === 'status') next.status = e.message
      else if (e.kind === 'tool') next.trail = [...cur.trail, e.entry]
      else if (e.kind === 'done') {
        next.busy = false
        next.status = ''
      } else if (e.kind === 'error') {
        next.busy = false
        next.error = e.message
      }
      return { live: { ...s.live, [e.scope]: next } }
    })
  }
}))
