import { createDeepAgent } from 'deepagents'
import type { BaseMessage } from '@langchain/core/messages'
import { makeModel } from './model.js'
import { buildInvestigation, makeSubmitTool } from './tools.js'
import { overviewSchema, sectionSchema, type OverviewPayload, type SectionPayload } from './schema.js'
import { diffToText, fileDiffText } from '../git/diff.js'
import { getSettings } from '../store/settings.js'
import type {
  AgentEvent,
  CodeAnchor,
  ChatMessage,
  DiffSummary,
  Overview,
  SectionPlan,
  TrailEntry,
  WalkthroughSection
} from '@shared/types'

const RECURSION_LIMIT = 80

const MISSION = `You are Glassbox — a patient tour guide whose ONLY job is to help a human *understand* a code change with as little effort as possible.

You are NOT a reviewer. Do not judge quality, suggest improvements, leave review comments, or score anything. Only explain.

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
  const { tools } = buildInvestigation({ diff, scope, maxFiles: settings.maxFilesPerSection, emit })

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
  const prompt = `Here is the change under review:\n\n${diffToText(diff)}\n\nInvestigate as needed to understand the big picture, then call submit_overview. Break the change into a small number of logical, top-down sections (group related files; aim for 2-7 sections). Each section needs an id, title, one-line teaser, and its files.`

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
  const { tools, trail } = buildInvestigation({ diff, scope, maxFiles: settings.maxFilesPerSection, emit })

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

Investigate the real repository with the repo_* tools to ground every explanation (read the changed files in full, follow imports and types, find call sites, peek at tests). Then call submit_walkthrough_section with:
- a one-sentence gist and a fuller plain-language summary
- the notable code chunks, each with what it does / how it fits / what calls it
- inline hover explanations for the symbols a reader would poke at (use the EXACT identifier and its line)
- zero or more traceable values showing how a value flows through the change, with concrete example values where helpful
- optionally, a gentle "guess what this does first?" self-check

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
    investigationTrail: trail
  }
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
  const { tools, trail } = buildInvestigation({ diff, scope, maxFiles: settings.maxFilesPerSection, emit })
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
  emit: (e: AgentEvent) => void
) {
  const prior = history.map((m) => ({ role: m.role, content: m.content }))
  const prompt = `${question}\n\n(Answer grounded in the actual repository under review. Use the repo_* tools to check before answering. Explain — do not review.)`
  return answer(diff, 'chat', prompt, emit, prior)
}
