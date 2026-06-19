import { z } from 'zod'

/**
 * Zod schemas are the structured contract for the agent's output.
 * The agent never emits JSON as text — it fills these by *calling* the
 * submit_* tools, so all structure comes from the tool-calling API.
 */

const chunkStory = z.object({
  what: z.string().describe('Plain-language: what this chunk of code does.'),
  fits: z.string().describe('How this chunk fits into the overall change / why it exists.'),
  calledBy: z
    .string()
    .describe('Call-site context: what calls this, and/or what it calls. "n/a" if not applicable.'),
  gotcha: z
    .string()
    .optional()
    .describe('A subtle point, edge case, footgun, or watch-out worth knowing about this block. Optional.')
})

const walkChunk = z.object({
  id: z.string().describe('Short stable id, e.g. "chunk-1".'),
  title: z.string().describe('Short human title for the chunk.'),
  file: z.string().describe('Repo-relative file path this chunk lives in.'),
  startLine: z.number().int().describe('1-based start line (new file numbering).'),
  endLine: z.number().int().describe('1-based end line (new file numbering).'),
  changeKind: z.enum(['added', 'modified', 'removed']).describe('What happened to this block in the diff.'),
  gist: z
    .string()
    .describe('ONE punchy line: what changed here. Always visible, so make it concrete and skimmable.'),
  story: chunkStory
})

const inlineExplanation = z.object({
  symbol: z.string().describe('The exact identifier as it appears in the code.'),
  file: z.string(),
  line: z.number().int().describe('1-based line where the symbol appears.'),
  kind: z.enum(['variable', 'function', 'type', 'constant', 'parameter', 'import', 'other']),
  gist: z.string().describe('One short sentence: what it is / where it came from / what it holds here.'),
  deep: z.string().describe('A richer explanation for readers who want more depth.')
})

const traceStep = z.object({
  file: z.string(),
  line: z.number().int(),
  label: z.string().describe('What happens to the value at this step.'),
  exampleValue: z
    .string()
    .optional()
    .describe('A concrete example of the value here, given the example input. Optional.')
})

const traceableValue = z.object({
  id: z.string(),
  name: z.string().describe('The value/variable being traced.'),
  description: z.string().describe('What this value represents and why it is worth tracing.'),
  steps: z.array(traceStep).describe('Ordered steps showing how the value flows through the change.')
})

const selfCheck = z.object({
  prompt: z.string().describe('A gentle "guess what this does first?" question. Never framed as a test.'),
  answer: z.string().describe('The answer to reveal after the reader guesses or skips.')
})

const quizQuestion = z.object({
  id: z.string().describe('Short stable id, e.g. "q1".'),
  question: z.string().describe('A question that tests real understanding of THIS code (not trivia).'),
  options: z.array(z.string()).min(2).max(4).describe('2-4 answer options.'),
  correctIndex: z.number().int().describe('0-based index of the correct option.'),
  explanation: z.string().describe('Why the correct answer is right (and others wrong).')
})

const reviewFinding = z.object({
  id: z.string().describe('Short stable id, e.g. "f1".'),
  file: z.string().describe('Repo-relative file the issue is in.'),
  startLine: z.number().int().describe('1-based start line of the problematic code (new file numbering).'),
  endLine: z.number().int().describe('1-based end line of the problematic code.'),
  severity: z.enum(['bug', 'smell', 'nit', 'question']).describe('bug = likely incorrect; smell = risky/poor; nit = minor; question = unclear intent.'),
  title: z.string().describe('Short label for the issue, shown once spotted (e.g. "Non-constant-time compare").'),
  hint: z.string().describe('A VAGUE nudge toward the area without giving it away — what to look for, not the answer.'),
  explanation: z.string().describe('The deep "why this is a problem" — concrete, grounded in THIS code, teaching the reader.'),
  suggestion: z.string().optional().describe('How a reviewer would ask for it to be fixed. Optional.')
})

export const sectionSchema = z.object({
  id: z.string().describe('The section id you were asked to build.'),
  title: z.string(),
  plainSummaryGist: z.string().describe('ONE plain-language sentence: the gist of this section.'),
  plainSummaryDeep: z
    .string()
    .describe('A fuller plain-language explanation (a short paragraph) for the deep-dive dial setting.'),
  files: z.array(z.string()).describe('Repo-relative files this section covers.'),
  chunks: z.array(walkChunk).describe('The notable code chunks in this section, each with its story.'),
  // The following are best-effort enrichments. Prose-only changes (docs, config)
  // may have nothing to put here, so they default to [] rather than failing the
  // whole section if the model omits them.
  inlineExplanations: z
    .array(inlineExplanation)
    .default([])
    .describe('Hover explanations for the important symbols a reader would poke at. Empty array is fine.'),
  traceableValues: z
    .array(traceableValue)
    .default([])
    .describe('Zero or more values worth watching flow through the change. Empty array is fine.'),
  selfCheck: selfCheck.optional(),
  insights: z
    .array(z.string())
    .default([])
    .describe('2-4 "aha" insights or gotchas about this code — the non-obvious things worth knowing. Empty array is fine.'),
  quiz: z
    .array(quizQuestion)
    .default([])
    .describe('1-3 quiz questions that test real understanding of this section. Empty array is fine.'),
  reviewFindings: z
    .array(reviewFinding)
    .default([])
    .describe('0-3 GENUINE potential issues a careful reviewer would flag in THIS code (bugs, footguns, risky patterns). Only real ones — never invent problems to fill the list. Empty array is fine for clean code.')
})

export type SectionPayload = z.infer<typeof sectionSchema>

export const findingAssessmentSchema = z.object({
  score: z.number().int().describe('0-100: how real and well-substantiated the user’s flagged concern is.'),
  verdict: z.string().describe('One short line: is this a genuine issue?'),
  reasoning: z.string().describe('Why it is (or isn’t) a real problem, grounded in the actual code.'),
  severity: z.enum(['bug', 'smell', 'nit', 'question']).describe('Your severity rating for what they flagged.')
})

export type FindingAssessmentPayload = z.infer<typeof findingAssessmentSchema>

export const scoreSchema = z.object({
  score: z.number().int().describe('0-100: how well the user understood, judged generously but honestly.'),
  verdict: z.string().describe('One short encouraging line summarizing their answer.'),
  good: z.string().describe('Specifically what the user got right.'),
  missing: z.string().describe('Specifically what they missed or got wrong (a helpful hint, not harsh).')
})

export type ScorePayload = z.infer<typeof scoreSchema>

export const reviewSchema = z.object({
  summary: z.string().describe('A 1-2 sentence plain-language summary of the change for the PR review.'),
  positives: z.array(z.string()).describe('Concrete good things about the change.'),
  concerns: z.array(z.string()).describe('Concrete concerns, risks, or suggested changes (empty if approving cleanly).'),
  body: z.string().describe('The full review comment body in markdown, ready to post.')
})

export type ReviewPayload = z.infer<typeof reviewSchema>

const sectionPlan = z.object({
  id: z.string().describe('Short stable id, e.g. "sec-auth".'),
  title: z.string(),
  teaser: z.string().describe('One line teasing what this section covers.'),
  files: z.array(z.string()).describe('Repo-relative files belonging to this section.')
})

export const overviewSchema = z.object({
  title: z.string().describe('A concise title for the whole change.'),
  whatGist: z.string().describe('ONE plain sentence: what this PR does.'),
  whatDeep: z.string().describe('A short paragraph: what this PR does, in plain language.'),
  why: z.string().describe('Why this change exists / the problem it solves.'),
  highlights: z.array(z.string()).default([]).describe('3-6 high-level bullet highlights. Empty array is fine.'),
  sections: z
    .array(sectionPlan)
    .describe('A logical breakdown of the change into walkthrough sections, top-down.')
})

export type OverviewPayload = z.infer<typeof overviewSchema>
