import { createDeepAgent } from 'deepagents'
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

async function makeAgent(model: any, tools: any[]) {
  return await createDeepAgent({ model, tools, systemPrompt: MISSION })
}

// ---------------------------------------------------------------------------
// Overview + section plan
// ---------------------------------------------------------------------------

export async function generateOverview(
  diff: DiffSummary,
  emit: (e: AgentEvent) => void
): Promise<Overview> {
  const scope = 'overview'
  const settings = await getSettings()
  emit({ kind: 'status', scope, message: 'Reading the whole change…' })

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

  const agent = await makeAgent(model, [...tools, submit])
  const prompt = `Here is the change under review:\n\n${diffToText(diff)}\n\nInvestigate as needed to understand the big picture (if a file's hunks were omitted above for size, read them with repo_diff), then call submit_overview. Break the change into a small number of logical, top-down sections (group related files; aim for 2-9 sections, and keep each section focused — ideally under ~15 files — so it can be investigated thoroughly). Each section needs an id, title, one-line teaser, and its files.`

  emit({ kind: 'status', scope, message: 'Forming the big picture…' })
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

  const agent = await makeAgent(model, [...tools, submit])

  const fileDiffs = plan.files.map((f) => fileDiffText(diff, f)).join('\n\n')
  const prompt = `Build the walkthrough for ONE section.

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
- reviewFindings: 0-3 GENUINE potential issues a careful reviewer would flag in THIS code — real bugs, footguns, edge cases mishandled, or risky patterns (e.g. non-constant-time comparisons, unhandled empty/null input, naive parsing, missing validation). For each: the file + exact line range, a severity, a short title, a VAGUE hint (points at the area to look, without giving away the answer), a deep explanation of why it's a problem, and an optional fix suggestion. Only flag real problems — if the code is clean, return an empty array. Do NOT duplicate the same point as both an insight and a finding.

Use line numbers from the NEW version of each file. Reuse the section id "${plan.id}".`

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
  const agent = await makeAgent(model, tools)

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
