<div align="center">

# 🔮 GLASSBOX

### don't read the diff like a caveman 🗿 — turn the PR into a game and actually *get it* 🧠✨

**code review but it's a dopamine slot machine.** an AI agent reads the whole change, then walks you through it like a Brilliant lesson — quizzes, coins, combos, loot vaults, the works. you don't *review* the diff. you *speedrun understanding it.*

`🪙 coins` · `🔥 combos` · `🎰 vaults` · `🧠 quizzes` · `🏅 levels` · `💯 no cap`

</div>

---

## the vibe 😤

AI vibe-codes a PR in 4 seconds. you still have to *understand* it. and a raw git diff? unreadable. boring. zero dopamine. you scroll, your eyes glaze, you smash "Approve," you pray. 🙏

**Glassbox said nah.** 🛑

it spins up a [LangChain **deepagents**](https://github.com/langchain-ai/deepagentsjs) agent that actually *reads the whole change* — every file, every call site — then becomes your hype tour guide. big picture first, then pokeable code, hover-for-lore, value-tracing animations, and a full **gamified** loop that makes your brain go brrr while you learn.

it is **NOT** a reviewer. **NOT** a linter. **NOT** a vibe-killing quality scorer. its only job: get the change into your head with maximum dopamine and minimum effort. 🧠⚡️

## why it goes hard 🚀

- 🗺️ **big picture first** — plain-language *what* + *why* before a single line of code
- 👆 **pokeable code** — hover any symbol for instant lore (what it is, where it came from, what it holds *right here*). tap to pin.
- 🎬 **value tracing** — watch a value *flow* through the change, line glowing as you step. cinematic.
- 🎚️ **depth dial** — one-line gist ⇄ deep dive, with "go deeper ⤓" for a fresh on-demand investigation
- ❓ **"wait, why this?"** — ask inline about any chunk, grounded in the real repo
- 🧠 **quizzes + self-check** — active recall, Brilliant-style, so it actually sticks
- 🔍 **investigation trail** — see exactly what the agent read to explain each part

## the dopamine layer 🎰

this is the part your brain is addicted to:

| 🎮 | what |
|----|------|
| 🪙 **coins + XP + levels** | earn for every insight, quiz, and trace. rank up: Intern → … → **Legend** |
| 🔥 **combos + crits** | chain actions fast for multipliers, random ×2/×3 crits, screen-shake, hype banners |
| 🎰 **hidden vaults** | coins locked behind "Decode" mini-games — prove you *get* the code to crack 'em |
| 🕹️ **the Arcade** | daily streak 🔥, quests 🎯, slot machine 🎰, mini-games 🎮, personal-best stats 📊 |
| 🎮 **learning games** | Order the Flow · Match Up · Fill the Blank — built from the actual PR |
| 🧰 **loot chests** | master a section, pop a chest, win a random jackpot |
| 💸 **buy the verdict** | you can't just approve. you **cash out** coins to unlock the final Approve / Request-changes — earned, not free |

> tl;dr: it's a casino, but the house always wins by making you *understand the code.* 💯

## run it 🏃

```bash
npm install
npm run dev      # 🚀 launches the Electron app
```

then: **drop a repo 📁 → pick the matchup ⚔️ (base 🆚 feature) → let's gooo 🚀**

```bash
npm run build       # production build (out/)
npm run typecheck   # tsc for main + renderer
```

**requirements:** Node 18+ (built on Node 26) · a local **git** repo with two branches · an LLM provider (below).

## pick your fighter 🥊 (LLM providers)

set it in **Settings** (⚙) inside the app:

| provider | needs |
|----------|-------|
| 🟣 **OpenCode Zen** *(the default sauce)* | key from [opencode.ai/auth](https://opencode.ai/auth) — OpenAI-compatible gateway |
| 🟠 **Anthropic** | `ANTHROPIC_API_KEY` env var, or paste a key in Settings (`claude-opus-4-8`) |
| 🟢 **Ollama** *(local, no key, zero cost)* | Ollama running at `localhost:11434` + a code model pulled |
| 🟡 **Amazon Bedrock** | AWS region + creds (or default chain) |
| 🔵 **Google Vertex AI** | GCP project + location + ADC |

🔒 keys live only in the main process. the renderer never sees them. we're not weird about your secrets.

> **broke but based?** install [Ollama](https://ollama.com), `ollama pull qwen2.5-coder`, pick **Ollama**, run infinite reviews for free. plus there's a **prefetch** toggle that cooks the next section in the background while you play — perfect for local. 🧑‍🍳

## under the hood 🔧

single **Electron + TypeScript** codebase. no Python sidecar. three layers:

| layer | path | job |
|-------|------|-----|
| 🧠 **Main** (Node) | `src/main/` | git ingestion, the deepagent, LLM providers, secrets, IPC |
| 🌉 **Preload** | `src/preload/` | typed `window.glassbox` bridge (context-isolated) |
| 🎨 **Renderer** (React) | `src/renderer/` | the entire interactive walkthrough + game UI |

- 🤖 **agent** — `deepagents` (`createDeepAgent`) on LangGraph, reading the *real* checked-out repo with sandboxed `repo_*` tools (`read_file`, `grep`, `glob`, `ls`, `diff`), bounded by a per-section file budget. every section comes back by **calling** `submit_walkthrough_section` — a **Zod** schema. all structure from tool-calling, *never* model-emitted JSON text. work is **lazy**: a section generates only when you open it.
- 🌿 **diff** — `simple-git` computes `base...feature`; `parse-diff` structures it.
- ✨ **code** — `shiki` tokenizes (JS regex engine — renderer CSP blocks WASM); inline explanations get mapped onto tokens to make them pokeable.
- 🎮 **game state** — `zustand` + localStorage; SFX via the Web Audio API (no asset files, CSP-safe).

## try it instantly 🧪

any repo with two branches works. spin a scratch one:

```bash
mkdir /tmp/demo && cd /tmp/demo && git init
# commit a base on main, branch off, make some changes...
```

pick `/tmp/demo`, compare `main 🆚 your-feature`, and **let's gooo.** 🚀

## roadmap 🛣️

- 📥 **input:** local git repos for now. GitHub/GitLab PR-URL ingestion is deferred — the ingestion layer is isolated in `src/main/git/` so it's easy to bolt on.
- 💾 walkthroughs + your coverage are cached per `(repo, base, feature)`, so reopening is instant.

<div align="center">

---

**built different. review different.** 🔮

*stop approving code you don't understand. start maxxing.* 🧠📈

</div>
