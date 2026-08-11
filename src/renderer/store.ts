import { create } from 'zustand'
import * as Sentry from '@sentry/electron/renderer'
import { useGame } from './game/store'
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

let _toastSeq = 0
let _guidedSeq = 0

/** Where the Understanding Map wants the guided tour to land. */
export interface GuidedTarget {
  /** null = the big-picture overview beat. */
  sectionId: string | null
  /** Jump to this block's beat; omitted means the section's first beat. */
  chunkId?: string
  /** Bumped every request so clicking the same entry twice still re-fires. */
  nonce: number
}

export interface SelfCheckResult {
  guess: string
  score: ScoreResult
}

export interface ChallengeResult {
  code: string
  score: ScoreResult
  hintsUsed: number
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

  // how the next journey starts: compare two branches, or explore a topic/question
  journeyMode: 'pr' | 'topic'
  topic: string

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
  /**
   * A jump requested from the Understanding Map while in guided mode. Guided
   * renders one beat at a time, so it cannot be navigated by scrolling to a DOM
   * id the way the scroll/presentation views are — it resolves this to a beat.
   */
  guidedTarget: GuidedTarget | null
  activeTrace: ActiveTrace | null
  selfCheckRevealed: string[] // chunk/section ids revealed
  selfCheckResults: Record<string, SelfCheckResult> // persisted per section across nav
  challengeResults: Record<string, ChallengeResult> // coding-challenge attempts per section
  openSections: Record<string, boolean>

  // live agent telemetry, keyed by scope (section id, "overview", "chat", ...)
  live: Record<string, LiveScope>

  // non-blocking error toasts
  toasts: Array<{ id: string; message: string }>
  addToast: (message: string) => void
  dismissToast: (id: string) => void

  // retry a failed section without clearing the rest of the walkthrough
  retrySection: (plan: SectionPlan) => Promise<void>

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
  setJourneyMode: (m: 'pr' | 'topic') => void
  setTopic: (t: string) => void
  startWalkthrough: () => Promise<void>
  startTopicJourney: () => Promise<void>
  backToOnboarding: () => void
  regenerate: () => Promise<void>
  resetAll: () => void

  ensureOverview: () => Promise<void>
  ensureSection: (plan: SectionPlan) => Promise<void>
  markWalked: (id: string) => void
  setSelfCheckResult: (sectionId: string, result: SelfCheckResult) => void
  setChallengeResult: (sectionId: string, result: ChallengeResult) => void
  setSectionOpen: (id: string, open: boolean) => void
  setViewMode: (m: ViewMode) => void
  setSlide: (n: number) => void
  jumpToGuided: (sectionId: string | null, chunkId?: string) => void
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
  // walkthrough instead of re-serving a stale or cross-loaded one. Topic
  // journeys additionally key on the question, so different questions about
  // the same commit get their own walkthroughs.
  const base = `${diff.repoPath}::${diff.base}::${diff.feature}::${diff.baseSha}::${diff.featureSha}`
  return diff.mode === 'topic' ? `${base}::topic::${diff.topic ?? ''}` : base
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

export const useStore = create<State>((set, get) => {
  // Shared journey entry: restore any cached session for this exact diff/topic
  // and switch to the walkthrough screen.
  const enterJourney = async (diff: DiffSummary) => {
    const key = sessionKeyOf(diff)
    const saved = await window.glassbox.loadSession(key)
    // Point the game's one-shot flags (quizzes solved, vaults cracked, chests
    // opened) at THIS walkthrough. Section ids like "sec-auth" and quiz ids
    // like "q1" repeat across repos, so an unscoped profile would open a fresh
    // walkthrough with everything already played.
    useGame.getState().setScope(key)
    set({
      diff,
      screen: 'walkthrough',
      busyDiff: false,
      // Keep the endpoint refs in sync with the diff — PokeableCode renders
      // files at `feature` and persist() records base/feature, and a topic
      // journey pins both to the repo's current branch rather than the selects.
      base: diff.base,
      feature: diff.feature,
      overview: saved?.overview ?? null,
      sections: saved?.sections ?? {},
      walked: saved?.walked ?? [],
      findings: saved?.findings ?? [],
      live: {},
      chatHistory: [],
      openSections: {},
      slideIndex: 0,
      guidedTarget: null,
      selfCheckResults: {},
      challengeResults: {}
    })
    if (!get().overview) {
      await get().ensureOverview()
    }
  }

  return {
  screen: 'onboarding',
  settingsOpen: false,
  chatOpen: false,

  repoPath: null,
  branches: [],
  base: '',
  feature: '',
  busyDiff: false,

  journeyMode: 'pr',
  topic: '',

  settings: null,

  diff: null,
  overview: null,
  sections: {},
  walked: [],
  findings: [],

  depth: 'deep',
  viewMode: 'guided',
  slideIndex: 0,
  guidedTarget: null,
  activeTrace: null,
  selfCheckRevealed: [],
  selfCheckResults: {},
  challengeResults: {},
  openSections: {},

  live: {},

  toasts: [],
  addToast(message) {
    const id = String(++_toastSeq)
    set((s) => ({ toasts: [...s.toasts, { id, message: message.slice(0, 120) }] }))
    setTimeout(() => get().dismissToast(id), 6000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

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
  setJourneyMode(m) {
    set({ journeyMode: m, error: null })
  },
  setTopic(t) {
    set({ topic: t })
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
      await enterJourney(diff)
    } catch (e) {
      Sentry.captureException(e, { extra: { scope: 'startWalkthrough' } })
      set({ busyDiff: false, error: (e as Error).message })
    }
  },

  async startTopicJourney() {
    const { repoPath, topic, base } = get()
    if (!repoPath || !topic.trim()) return
    if (!base) {
      set({ error: 'Pick a branch to ask questions against.' })
      return
    }
    set({ busyDiff: true, error: null })
    try {
      const diff = await window.glassbox.computeTopicSnapshot(repoPath, topic, base)
      await enterJourney(diff)
    } catch (e) {
      Sentry.captureException(e, { extra: { scope: 'startTopicJourney' } })
      set({ busyDiff: false, error: (e as Error).message })
    }
  },

  // not in the public interface but used internally
  async ensureOverview() {
    const { diff } = get()
    if (!diff) return
    // Clear any stale error so the spinner shows immediately when retrying.
    set((s) => ({ live: { ...s.live, overview: { status: 'Starting…', trail: [], busy: true, error: undefined } } }))
    try {
      const overview = await window.glassbox.generateOverview(diff)
      set({ overview })
      persist(get)
    } catch (e) {
      const err = e as Error
      Sentry.captureException(err, { extra: { scope: 'overview' } })
      get().addToast(`Overview failed: ${err.message}`)
      set((s) => ({
        live: { ...s.live, overview: { ...(s.live.overview ?? { status: '', trail: [] }), busy: false, error: err.message } }
      }))
    }
  },

  backToOnboarding() {
    useGame.getState().setScope('')
    set({ screen: 'onboarding', diff: null, overview: null, sections: {}, walked: [], findings: [], live: {}, chatHistory: [], chatContext: null, openSections: {}, slideIndex: 0, guidedTarget: null, selfCheckResults: {}, challengeResults: {} })
  },

  // Discard the cached AI walkthrough for the current branches and re-run it.
  async regenerate() {
    if (!get().diff) return
    // The old sections are gone, so their play state must go too — the agent
    // reuses ids like "sec-auth"/"q1", which would otherwise land pre-solved.
    useGame.getState().clearScope()
    set({ overview: null, sections: {}, walked: [], findings: [], live: {}, chatHistory: [], openSections: {}, slideIndex: 0, guidedTarget: null, selfCheckResults: {}, challengeResults: {} })
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
    // Clear any stale error so the spinner shows immediately when retrying.
    set((s) => ({ live: { ...s.live, [plan.id]: { status: 'Starting…', trail: [], busy: true, error: undefined } } }))
    try {
      const section = await window.glassbox.generateSection(diff, plan)
      set((s) => ({ sections: { ...s.sections, [plan.id]: section } }))
      persist(get)
    } catch (e) {
      const err = e as Error
      Sentry.captureException(err, { extra: { scope: plan.id, sectionTitle: plan.title } })
      get().addToast(`"${plan.title}" failed: ${err.message}`)
      set((s) => ({
        live: {
          ...s.live,
          [plan.id]: { ...(s.live[plan.id] ?? { status: '', trail: [] }), busy: false, error: err.message }
        }
      }))
    }
  },

  retrySection: async (plan) => {
    // Clear only this section's error state and re-trigger loading.
    set((s) => {
      const newLive = { ...s.live }
      delete newLive[plan.id]
      return { live: newLive }
    })
    await get().ensureSection(plan)
  },

  markWalked(id) {
    set((s) => (s.walked.includes(id) ? s : { walked: [...s.walked, id] }))
    persist(get)
  },

  setSelfCheckResult(sectionId, result) {
    set((s) => ({ selfCheckResults: { ...s.selfCheckResults, [sectionId]: result } }))
  },

  setChallengeResult(sectionId, result) {
    set((s) => ({ challengeResults: { ...s.challengeResults, [sectionId]: result } }))
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
  jumpToGuided(sectionId, chunkId) {
    set({ guidedTarget: { sectionId, chunkId, nonce: ++_guidedSeq } })
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
      Sentry.captureException(e, { extra: { scope: 'chat' } })
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
        // These errors may already be captured in ensureSection/ensureOverview catch blocks,
        // but stream-level errors (e.g. tool failures) may only arrive here.
        Sentry.captureMessage(e.message, { level: 'error', extra: { scope: e.scope } })
        // Show a non-blocking toast; addToast is called outside set() to avoid
        // nested state mutation.
        setTimeout(() => get().addToast(e.message), 0)
      }
      return { live: { ...s.live, [e.scope]: next } }
    })
  }
  }
})
