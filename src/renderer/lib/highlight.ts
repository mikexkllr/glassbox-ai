import { createHighlighter, type Highlighter, type ThemedToken } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const THEME = 'vitesse-dark'
const LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'python', 'go', 'rust', 'java', 'kotlin',
  'json', 'yaml', 'toml', 'markdown', 'bash', 'sql', 'html', 'css', 'scss',
  'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'vue'
]

let hp: Promise<Highlighter> | null = null

async function get(): Promise<Highlighter> {
  // Use the pure-JS regex engine so we don't load WASM (blocked by the renderer CSP).
  if (!hp) hp = createHighlighter({ themes: [THEME], langs: LANGS, engine: createJavaScriptRegexEngine() })
  return hp
}

export type Line = ThemedToken[]

/** Tokenize code into per-line themed tokens. Falls back to plain text for unknown langs. */
export async function tokenize(code: string, lang: string): Promise<Line[]> {
  const hl = await get()
  const loaded = hl.getLoadedLanguages()
  const language = loaded.includes(lang) ? lang : 'text'
  const { tokens } = hl.codeToTokens(code, { lang: language as any, theme: THEME })
  return tokens
}
