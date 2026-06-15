# 🔍 Glassbox

**Don't read the diff. Let a guide who's already read the whole change walk you through it — until it just clicks.**

When an AI vibe-codes a PR, a human still has to *understand* it — and a raw git diff is a miserable way to do that. Glassbox flips the experience: a [LangChain **deepagents**](https://github.com/langchain-ai/deepagentsjs) agent that has already read and understood the whole change becomes a patient, interactive tour guide.

It is **not** a reviewer, linter, or quality scorer. Its one job is to make *the human* understand the code with as little effort as possible.

## What it does

- **Big picture first** — plain-language *what* and *why* before any code.
- **Pokeable code** — hover any symbol for a live, contextual explanation (what it is, where it came from, what it holds here). Click to pin.
- **Story per chunk** — what it does / how it fits / what calls it.
- **Visual value tracing** — watch a value flow through the change step-by-step, with concrete example values, the matching code line glowing as you step.
- **Explain-depth dial** — one-line gist ⇄ deep dive, with "go deeper ⤓" for an on-demand, freshly-investigated answer.
- **"Wait, why this?"** — ask inline about any chunk; grounded in the real repo.
- **Optional self-check** — a skippable "guess what this does first?" beat for active recall (never scored).
- **Understanding map** — a gentle coverage map of where you've been vs. what's left.
- **Investigation trail** — see exactly what Glassbox read to explain each part ("read `auth.ts`, `users.ts`, and the tests").
- **Ask anything** — a chat panel powered by the same agent, grounded in the repo.

## Architecture

Single Electron + TypeScript codebase, three layers:

| Layer | Path | Responsibility |
|------|------|----------------|
| **Main** (Node) | `src/main/` | git diff ingestion, the deepagent, LLM providers, secrets, IPC |
| **Preload** | `src/preload/` | typed `window.glassbox` bridge (context-isolated) |
| **Renderer** (React) | `src/renderer/` | the entire interactive walkthrough UI |

- **Agent** — `deepagents` (`createDeepAgent`) on LangGraph. The agent investigates the *real* checked-out repo with custom, sandboxed `repo_*` tools (`read_file`, `grep`, `glob`, `ls`, `diff`), bounded by a per-section file budget. It returns each section by **calling** `submit_walkthrough_section`, whose arguments are a **Zod** schema — all structure comes from the tool-calling API, never model-emitted JSON text. Work is **lazy**: a section is generated only when you open it.
- **Diff** — `simple-git` computes `base...feature`; `parse-diff` turns it into a structured model.
- **Code rendering** — `shiki` tokenizes; inline explanations are mapped onto tokens to make them pokeable.

## Requirements

- Node 18+ (developed on Node 26)
- A local **git** repo with two branches to compare
- An LLM provider (see below)

## Run

```bash
npm install
npm run dev      # launches the Electron app
```

Then: **pick a repo → choose base + feature branches → Start walkthrough.**

Other scripts:

```bash
npm run build       # production build (out/)
npm run typecheck   # tsc for main + renderer
```

## LLM providers

Configure in **Settings** (⚙) inside the app. All four are selectable:

| Provider | Needs |
|----------|-------|
| **Anthropic** (default, `claude-opus-4-8`) | `ANTHROPIC_API_KEY` env var, or paste a key in Settings |
| **Ollama** (local, no key) | Ollama running at `http://localhost:11434` + a code model pulled |
| **Amazon Bedrock** | AWS region + credentials (or default credential chain) |
| **Google Vertex AI** | GCP project + location + ADC |

API keys live only in the main process and are never exposed to the renderer.

> **Quickest start with no key:** install [Ollama](https://ollama.com), `ollama pull qwen2.5-coder`, then pick **Ollama** in Settings.

## Try it with the demo repo

A scratch repo is handy for a first run. Any repo with two branches works; for example:

```bash
mkdir /tmp/demo && cd /tmp/demo && git init
# ... commit a base on main, then make changes on a feature branch ...
```

Pick `/tmp/demo`, compare `main → your-feature`, and start the walkthrough.

## Notes / roadmap

- **Input:** local git repos. GitHub/GitLab PR-URL ingestion is deferred; the ingestion layer is isolated in `src/main/git/` to make it easy to add.
- Generated walkthroughs and your coverage are cached per `(repo, base, feature)` in the app's user-data dir, so reopening is instant.
