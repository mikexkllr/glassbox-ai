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

export const sectionSchema = z.object({
  id: z.string().describe('The section id you were asked to build.'),
  title: z.string(),
  plainSummaryGist: z.string().describe('ONE plain-language sentence: the gist of this section.'),
  plainSummaryDeep: z
    .string()
    .describe('A fuller plain-language explanation (a short paragraph) for the deep-dive dial setting.'),
  files: z.array(z.string()).describe('Repo-relative files this section covers.'),
  chunks: z.array(walkChunk).describe('The notable code chunks in this section, each with its story.'),
  inlineExplanations: z
    .array(inlineExplanation)
    .describe('Hover explanations for the important symbols a reader would poke at.'),
  traceableValues: z
    .array(traceableValue)
    .describe('Zero or more values worth watching flow through the change. Empty array is fine.'),
  selfCheck: selfCheck.optional(),
  insights: z
    .array(z.string())
    .describe('2-4 "aha" insights or gotchas about this code — the non-obvious things worth knowing.'),
  quiz: z.array(quizQuestion).describe('1-3 quiz questions that test real understanding of this section.')
})

export type SectionPayload = z.infer<typeof sectionSchema>

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
  highlights: z.array(z.string()).describe('3-6 high-level bullet highlights.'),
  sections: z
    .array(sectionPlan)
    .describe('A logical breakdown of the change into walkthrough sections, top-down.')
})

export type OverviewPayload = z.infer<typeof overviewSchema>
