import { createHighlighter, type Highlighter, type ThemedToken } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const DEFAULT_THEME = 'vitesse-dark'
// Every theme the shop can equip must be bundled here so it's ready to switch to.
const THEMES = [
  'vitesse-dark', 'github-dark', 'one-dark-pro', 'nord', 'tokyo-night', 'dracula',
  'catppuccin-mocha', 'synthwave-84'
]
const LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'python', 'go', 'rust', 'java', 'kotlin',
  'json', 'yaml', 'toml', 'markdown', 'bash', 'sql', 'html', 'css', 'scss',
  'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'vue'
]

let hp: Promise<Highlighter> | null = null

async function get(): Promise<Highlighter> {
  // Use the pure-JS regex engine so we don't load WASM (blocked by the renderer CSP).
  if (!hp) hp = createHighlighter({ themes: THEMES, langs: LANGS, engine: createJavaScriptRegexEngine() })
  return hp
}

export type Line = ThemedToken[]

/** Tokenize code into per-line themed tokens. Falls back to plain text / default theme. */
export async function tokenize(code: string, lang: string, theme = DEFAULT_THEME): Promise<Line[]> {
  const hl = await get()
  const language = hl.getLoadedLanguages().includes(lang) ? lang : 'text'
  const useTheme = hl.getLoadedThemes().includes(theme) ? theme : DEFAULT_THEME
  const { tokens } = hl.codeToTokens(code, { lang: language as any, theme: useTheme })
  return tokens
}
