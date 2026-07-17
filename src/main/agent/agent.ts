import { createDeepAgent } from 'deepagents'
import { createMiddleware, ToolInvocationError, ToolMessage } from 'langchain'
import type { BaseMessage } from '@langchain/core/messages'
import { makeModel } from './model.js'
import { buildInvestigation, makeSubmitTool } from './tools.js'
import {
  overviewSchema,
  sectionSchema,
  scoreSchema,
  reviewSchema,
  findingAssessmentSchema,
  type OverviewPayload,
  type SectionPayload,
  type ScorePayload,
  type ReviewPayload,
  type FindingAssessmentPayload
} from './schema.js'
import { diffToText, fileDiffText } from '../git/diff.js'
import { ensureWorktree } from '../git/worktree.js'
import { getSettings } from '../store/settings.js'
import type {
  AgentEvent,
  CodeAnchor,
  ChatMessage,
  DiffSummary,
  FindingAssessment,
  Overview,
  ReviewDecision,
  ReviewDraft,
  ScoreResult,
  SectionPlan,
  TrailEntry,
  WalkthroughSection
} from '@shared/types'

const RECURSION_LIMIT = 80

const MISSION = `You are Glassbox — a patient tour guide who helps a human *understand* a code change with as little effort as possible.

Your default mode is explaining, not nitpicking: lead with what the code does and why. Some tasks additionally ask you to surface potential issues (to train the reader's review skills) or to draft a PR review — when a task explicitly asks for that, do it, but flag only GENUINE problems grounded in the real code; never invent issues to fill a list.

You have already been given the diff. Genuinely INVESTIGATE the real repository using the repo_* tools — follow imports, read type definitions, open tests, find call sites — so your explanations are real, not guessed. Prefer reading the actual code over speculating. Stay within your file budget; investigate what matters most first.

Write in plain, warm language a busy developer can absorb fast. Be concrete and specific to THIS code. Avoid restating the diff line-by-line — explain what it means and why.`

const TOPIC_MISSION = `You are Glassbox — a patient tour guide who helps a human *understand a codebase* with as little effort as possible.

The reader has asked a question (or named a topic) about this repository. There is no diff — your job is to build a guided journey through the EXISTING code that answers their question: where the relevant code lives, how it works, and how the pieces connect.

Genuinely INVESTIGATE the real repository using the repo_* tools — list directories, grep for the relevant concepts, follow imports, read type definitions, open tests, find call sites — so your explanations are real, not guessed. Prefer reading the actual code over speculating. Stay within your file budget; investigate what matters most first.

Write in plain, warm language a busy developer can absorb fast. Be concrete and specific to THIS code. Anchor every explanation to real files and line numbers so the reader can see the code you are describing.`

function missionFor(diff: DiffSummary): string {
  return diff.mode === 'topic' ? TOPIC_MISSION : MISSION
}

function extractText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.getType?.() === 'ai' || (m as any)._getType?.() === 'ai') {
      const c = m.content
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        return c
          .map((p: any) => (typeof p === 'string' ? p : p.type === 'text' ? p.text : ''))
          .join('')
          .trim()
      }
    }
  }
  // Fallback: last message content.
  const last = messages[messages.length - 1]
  return typeof last?.content === 'string' ? last.content : ''
}

function findToolInvocationError(e: unknown): { toolCall?: ToolInvocationError['toolCall']; detail: string } | null {
  // The error may be wrapped in one or more MiddlewareErrors, which copy the
  // inner error's `name` but not its `toolCall`/`toolError` — walk the cause
  // chain for the real ToolInvocationError first, falling back to a name match.
  let named: Error | null = null
  for (let cur = e as any, depth = 0; cur && depth < 6; cur = cur.cause, depth++) {
    if (cur instanceof ToolInvocationError) {
      return { toolCall: cur.toolCall, detail: cur.toolError?.message ?? cur.message }
    }
    if (cur instanceof Error && cur.name === 'ToolInvocationError') named = cur
  }
  return named ? { detail: named.message } : null
}

// deepagents installs wrapToolCall middleware, and langchain re-throws tool
// errors that surface through middleware instead of feeding them back to the
// model — so a single malformed tool call (e.g. args that fail the zod schema)
// would abort the whole run. Catch input-parsing failures here and return them
// as a ToolMessage so the model can correct its own call within the same run.
const toolErrorFeedback = createMiddleware({
  name: 'toolErrorFeedback',
  wrapToolCall: async (request, handler) => {
    try {
      return await handler(request)
    } catch (e) {
      const invocation = findToolInvocationError(e)
      const toolCall = invocation?.toolCall ?? request.toolCall
      if (!invocation || !toolCall?.id) throw e
      return new ToolMessage({
        name: toolCall.name,
        tool_call_id: toolCall.id,
        content: `Your ${toolCall.name} call was rejected: ${invocation.detail.slice(0, 2000)}\nCall ${toolCall.name} again with ALL required fields, passing plain JSON arguments only — never XML-style <parameter> tags inside string values.`
      })
    }
  }
})

async function makeAgent(model: any, tools: any[], mission: string = MISSION) {
  return await createDeepAgent({ model, tools, systemPrompt: mission, middleware: [toolErrorFeedback] })
}

// ---------------------------------------------------------------------------
// Overview + section plan
// ---------------------------------------------------------------------------

export async function generateOverview(
  diff: DiffSummary,
  emit: (e: AgentEvent) => void
): Promise<Overview> {
  const scope = 'overview'
  const topicMode = diff.mode === 'topic'
  const settings = await getSettings()
  emit({ kind: 'status', scope, message: topicMode ? 'Scouting the codebase…' : 'Reading the whole change…' })

  const model = await makeModel(settings)
  emit({ kind: 'status', scope, message: 'Checking out the feature branch in an isolated worktree…' })
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools } = buildInvestigation({ diff, scope, repoRoot, maxFiles: settings.maxFilesPerSection, emit })

  let captured: OverviewPayload | null = null
  const submit = makeSubmitTool(
    'submit_overview',
    'Submit the big-picture overview and the section breakdown of this change.',
    overviewSchema,
    (v) => {
      captured = v
    }
  )

  const agent = await makeAgent(model, [...tools, submit], missionFor(diff))
  const prompt = topicMode
    ? `The reader wants a guided journey through this repository, driven by their question/topic:

"${diff.topic}"

Explore the repository with the repo_* tools (start with repo_ls and repo_grep for the relevant concepts, then read the key files) until you can answer the question and know where the relevant code lives. Then call submit_overview:
- title: a concise title for the journey (not the question verbatim)
- whatGist/whatDeep: a direct plain-language answer to the question, grounded in what you found
- why: why the code is designed this way / what problem it solves
- highlights: 3-6 bullet takeaways
- sections: a logical top-down learning path through the relevant code (aim for 2-7 sections, each focused on one part of the answer — e.g. entry point, core logic, storage, edge cases). Each section needs an id, title, one-line teaser, and the repo-relative files it covers. Only include files that actually exist and matter to the question.`
    : `Here is the change under review:\n\n${diffToText(diff)}\n\nInvestigate as needed to understand the big picture (if a file's hunks were omitted above for size, read them with repo_diff), then call submit_overview. Break the change into a small number of logical, top-down sections (group related files; aim for 2-9 sections, and keep each section focused — ideally under ~15 files — so it can be investigated thoroughly). Each section needs an id, title, one-line teaser, and its files.`

  emit({ kind: 'status', scope, message: topicMode ? 'Charting the journey…' : 'Forming the big picture…' })
  const res: any = await agent.invoke(
    { messages: [{ role: 'user', content: prompt }] },
    { recursionLimit: RECURSION_LIMIT }
  )

  if (!captured) {
    const text = extractText(res.messages)
    throw new Error(`The model did not submit an overview. It said:\n${text.slice(0, 500)}`)
  }
  emit({ kind: 'done', scope })
  return captured as Overview
}

// ---------------------------------------------------------------------------
// One walkthrough section (lazy)
// ---------------------------------------------------------------------------

export async function generateSection(
  diff: DiffSummary,
  plan: SectionPlan,
  emit: (e: AgentEvent) => void
): Promise<WalkthroughSection> {
  const scope = plan.id
  const settings = await getSettings()
  emit({ kind: 'status', scope, message: `Investigating "${plan.title}"…` })

  const model = await makeModel(settings)
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools, trail } = buildInvestigation({ diff, scope, repoRoot, maxFiles: settings.maxFilesPerSection, emit })

  let captured: SectionPayload | null = null
  const submit = makeSubmitTool(
    'submit_walkthrough_section',
    'Submit the finished walkthrough for this section (summary, chunks, inline explanations, traceable values, optional self-check).',
    sectionSchema,
    (v) => {
      captured = v
    }
  )

  const agent = await makeAgent(model, [...tools, submit], missionFor(diff))

  const topicPrompt = `Build the walkthrough for ONE section of a topic journey through this repository.

The reader's question/topic: "${diff.topic}"

Section id: ${plan.id}
Section title: ${plan.title}
What it covers: ${plan.teaser}
Files: ${plan.files.join(', ')}

There is no diff — this journey explores the EXISTING code. Investigate the real repository with the repo_* tools to ground every explanation (read the listed files in full, follow imports and types, find call sites, peek at tests). Then call submit_walkthrough_section with:
- a one-sentence gist and a fuller plain-language summary of what this section teaches about the topic
- the notable code chunks (the blocks a reader must see to understand this part of the answer). For EACH chunk: set changeKind to "context", give a punchy one-line "gist" of what this block does, and a story (what it does / how it fits into the answer / what calls it, plus an optional "gotcha")
- inline hover explanations for the symbols a reader would poke at (use the EXACT identifier and its line)
- zero or more traceable values showing how a value flows through this code, with concrete example values where helpful
- optionally, a gentle "guess what this does first?" self-check
- 2-4 "aha" insights/gotchas: the non-obvious things a sharp engineer would point out about this code
- 1-3 quiz questions that test REAL understanding of this specific code (each with options, the correct index, and an explanation)
- codingChallenge: ONE small hands-on exercise built from this section's code — a 5-20 line self-contained starter snippet (adapted from the real code, simplified if needed) with ONE clearly marked gap (e.g. "// TODO: your code here") that exercises the section's key idea, plus the reference solution, 1-3 progressive hints, and a difficulty. Make it solvable from the snippet alone. Omit only if there is genuinely no code to exercise.
- reviewFindings: 0-3 GENUINE potential issues a careful reviewer would flag in THIS code — real bugs, footguns, edge cases mishandled, or risky patterns. Only flag real problems — if the code is clean, return an empty array.

Use the current line numbers of each file. Reuse the section id "${plan.id}".`

  const fileDiffs = diff.mode === 'topic' ? '' : plan.files.map((f) => fileDiffText(diff, f)).join('\n\n')
  const prPrompt = `Build the walkthrough for ONE section.

Section id: ${plan.id}
Section title: ${plan.title}
What it covers: ${plan.teaser}
Files: ${plan.files.join(', ')}

The diff for these files:

${fileDiffs}

Investigate the real repository with the repo_* tools to ground every explanation (read the changed files in full, follow imports and types, find call sites, peek at tests; if a diff above was truncated for size, call repo_diff for the full hunks). Then call submit_walkthrough_section with:
- a one-sentence gist and a fuller plain-language summary
- the notable code chunks. For EACH chunk include: its changeKind (added/modified/removed), a punchy one-line "gist" of what changed there (always shown, even in gist mode — make it concrete), and a story (what it does / how it fits / what calls it, plus an optional "gotcha": a subtle point, edge case, or footgun)
- inline hover explanations for the symbols a reader would poke at (use the EXACT identifier and its line)
- zero or more traceable values showing how a value flows through the change, with concrete example values where helpful
- optionally, a gentle "guess what this does first?" self-check
- 2-4 "aha" insights/gotchas: the non-obvious things a sharp engineer would point out about this code
- 1-3 quiz questions that test REAL understanding of this specific code (each with options, the correct index, and an explanation)
- codingChallenge: ONE small hands-on exercise built from this section's change — a 5-20 line self-contained starter snippet (adapted from the real code, simplified if needed) with ONE clearly marked gap (e.g. "// TODO: your code here") that makes the reader re-implement the key idea of the change, plus the reference solution, 1-3 progressive hints, and a difficulty. Make it solvable from the snippet alone. Omit only if there is genuinely no code to exercise.
- reviewFindings: 0-3 GENUINE potential issues a careful reviewer would flag in THIS code — real bugs, footguns, edge cases mishandled, or risky patterns (e.g. non-constant-time comparisons, unhandled empty/null input, naive parsing, missing validation). For each: the file + exact line range, a severity, a short title, a VAGUE hint (points at the area to look, without giving away the answer), a deep explanation of why it's a problem, and an optional fix suggestion. Only flag real problems — if the code is clean, return an empty array. Do NOT duplicate the same point as both an insight and a finding.

Use line numbers from the NEW version of each file. Reuse the section id "${plan.id}".`

  const prompt = diff.mode === 'topic' ? topicPrompt : prPrompt
  const res: any = await agent.invoke(
    { messages: [{ role: 'user', content: prompt }] },
    { recursionLimit: RECURSION_LIMIT }
  )

  if (!captured) {
    const text = extractText(res.messages)
    throw new Error(`The model did not submit a section. It said:\n${text.slice(0, 500)}`)
  }
  emit({ kind: 'done', scope })

  const payload = captured as SectionPayload
  return {
    ...payload,
    id: plan.id,
    title: payload.title || plan.title,
    traceableValues: payload.traceableValues ?? [],
    insights: payload.insights ?? [],
    quiz: payload.quiz ?? [],
    reviewFindings: payload.reviewFindings ?? [],
    investigationTrail: trail
  }
}

// ---------------------------------------------------------------------------
// Score a user's free-text answer (good/bad hints + a number)
// ---------------------------------------------------------------------------

export async function scoreAnswer(
  diff: DiffSummary,
  question: string,
  reference: string,
  userAnswer: string,
  emit: (e: AgentEvent) => void
): Promise<ScoreResult> {
  const scope = 'score'
  const settings = await getSettings()
  const model = await makeModel(settings)
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools } = buildInvestigation({ diff, scope, repoRoot, maxFiles: Math.min(4, settings.maxFilesPerSection), emit })

  let captured: ScorePayload | null = null
  const submit = makeSubmitTool(
    'submit_score',
    'Submit your assessment of the user’s answer.',
    scoreSchema,
    (v) => {
      captured = v
    }
  )
  const agent = await makeAgent(model, [...tools, submit])
  const prompt = `You are a warm, encouraging coach. A learner is studying this code change.

Question they were asked: "${question}"
Reference / what a strong answer covers: "${reference}"
The learner's answer: "${userAnswer}"

Judge generously but honestly. Reward genuine understanding and good intuition even if imperfectly worded. If needed, peek at the real code with the repo_* tools. Then call submit_score with a 0-100 score, a short verdict, what they got right, and what they missed (as a kind hint).`

  const res: any = await agent.invoke({ messages: [{ role: 'user', content: prompt }] }, { recursionLimit: 24 })
  emit({ kind: 'done', scope })
  if (!captured) {
    return { score: 50, verdict: 'Got it.', good: 'You engaged with it.', missing: extractText(res.messages).slice(0, 200) }
  }
  return captured as ScoreResult
}

// ---------------------------------------------------------------------------
// Assess a free-form review flag the user raised (the Bug Hunt's honesty check)
// ---------------------------------------------------------------------------

export async function assessFinding(
  diff: DiffSummary,
  anchor: CodeAnchor,
  note: string,
  emit: (e: AgentEvent) => void
): Promise<FindingAssessment> {
  const scope = 'assess'
  const settings = await getSettings()
  const model = await makeModel(settings)
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools } = buildInvestigation({ diff, scope, repoRoot, maxFiles: Math.min(6, settings.maxFilesPerSection), emit })

  let captured: FindingAssessmentPayload | null = null
  const submit = makeSubmitTool(
    'submit_finding_assessment',
    'Submit your verdict on the user’s flagged concern.',
    findingAssessmentSchema,
    (v) => {
      captured = v
    }
  )
  const agent = await makeAgent(model, [...tools, submit])
  const prompt = `You are a senior reviewer judging whether a learner's review flag is a real issue.

They flagged ${anchor.file} lines ${anchor.startLine}-${anchor.endLine} and wrote:
"${note}"

Read the actual code around there with the repo_* tools. Decide, honestly, whether this is a genuine problem (a bug, footgun, risky pattern, or fair concern) or a false alarm. Reward real insight; don't reward vague or wrong flags. Then call submit_finding_assessment with a 0-100 score (how real/substantiated), a one-line verdict, your reasoning grounded in the code, and a severity.`

  const res: any = await agent.invoke({ messages: [{ role: 'user', content: prompt }] }, { recursionLimit: 28 })
  emit({ kind: 'done', scope })
  if (!captured) {
    return { score: 40, verdict: 'Noted.', reasoning: extractText(res.messages).slice(0, 200), severity: 'question' }
  }
  return captured as FindingAssessment
}

// ---------------------------------------------------------------------------
// Generate the final PR review (the "cashout")
// ---------------------------------------------------------------------------

export async function generateReview(
  diff: DiffSummary,
  decision: ReviewDecision,
  notes: string,
  emit: (e: AgentEvent) => void
): Promise<ReviewDraft> {
  const scope = 'review'
  const settings = await getSettings()
  emit({ kind: 'status', scope, message: 'Drafting your review…' })
  const model = await makeModel(settings)
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools } = buildInvestigation({ diff, scope, repoRoot, maxFiles: settings.maxFilesPerSection, emit })

  let captured: ReviewPayload | null = null
  const submit = makeSubmitTool(
    'submit_review',
    'Submit the drafted PR review.',
    reviewSchema,
    (v) => {
      captured = v
    }
  )
  const agent = await makeAgent(model, [...tools, submit])
  const decisionText =
    decision === 'approve' ? 'APPROVE' : decision === 'request_changes' ? 'REQUEST CHANGES' : 'COMMENT (no explicit decision)'
  const prompt = `Help the user write a PR review for this change. Their decision: ${decisionText}.
Their own notes (optional): "${notes || '(none)'}"

Investigate the change with the repo_* tools as needed, then call submit_review with: a short summary, concrete positives, concrete concerns (empty if approving cleanly), and a ready-to-post markdown body that matches the chosen decision. Be specific to THIS code.`

  const res: any = await agent.invoke({ messages: [{ role: 'user', content: prompt }] }, { recursionLimit: RECURSION_LIMIT })
  emit({ kind: 'done', scope })
  if (!captured) {
    const text = extractText(res.messages)
    return { decision, summary: text.slice(0, 200), positives: [], concerns: [], body: text }
  }
  return { decision, ...(captured as ReviewPayload) }
}

// ---------------------------------------------------------------------------
// Free-form grounded answers: "why this?", deeper, chat
// ---------------------------------------------------------------------------

async function answer(
  diff: DiffSummary,
  scope: string,
  userPrompt: string,
  emit: (e: AgentEvent) => void,
  priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ answer: string; trail: TrailEntry[] }> {
  const settings = await getSettings()
  const model = await makeModel(settings)
  const repoRoot = await ensureWorktree(diff.repoPath, diff.feature, diff.featureSha)
  const { tools, trail } = buildInvestigation({ diff, scope, repoRoot, maxFiles: settings.maxFilesPerSection, emit })
  const agent = await makeAgent(model, tools, missionFor(diff))

  emit({ kind: 'status', scope, message: 'Looking into it…' })
  const res: any = await agent.invoke(
    { messages: [...priorMessages, { role: 'user', content: userPrompt }] },
    { recursionLimit: RECURSION_LIMIT }
  )
  emit({ kind: 'done', scope })
  return { answer: extractText(res.messages), trail }
}

export function askWhy(
  diff: DiffSummary,
  question: string,
  context: string,
  emit: (e: AgentEvent) => void
) {
  const prompt = `A reader is looking at this part of the change:\n\n${context}\n\nThey ask: "${question}"\n\nInvestigate the repository as needed and answer concisely and concretely, grounded in the real code. Explain — do not review.`
  return answer(diff, 'why', prompt, emit)
}

export function explainDeeper(
  diff: DiffSummary,
  anchor: CodeAnchor,
  current: string,
  emit: (e: AgentEvent) => void
) {
  const prompt = `Give a deeper, more thorough explanation of ${anchor.file} lines ${anchor.startLine}-${anchor.endLine}. The reader has already seen this shorter explanation:\n\n"${current}"\n\nGo deeper: edge cases, types, data flow, and how it connects to the rest of the repo. Investigate with the repo_* tools. Explain — do not review.`
  return answer(diff, 'deeper', prompt, emit)
}

export function chat(
  diff: DiffSummary,
  history: ChatMessage[],
  question: string,
  emit: (e: AgentEvent) => void,
  context?: string
) {
  const focus = context
    ? `The reader is currently looking at:\n${context}\n\nWhen they say "this/here/it", assume they mean that unless they clearly mean something else.\n\n`
    : ''
  const prompt = `${focus}${question}\n\n(Answer grounded in the actual repository under review. Use the repo_* tools to check before answering. Explain — do not review.)`
  return answer(diff, 'chat', prompt, emit, prior(history))
}

function prior(history: ChatMessage[]) {
  return history.map((m) => ({ role: m.role, content: m.content }))
}
