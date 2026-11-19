<div align="center">

# 🔮 GLASSBOX

### don't read the diff like a caveman 🗿 — turn the PR into a game and actually *get it* 🧠✨

[![License: MIT](https://img.shields.io/badge/License-MIT-7c9cff.svg)](LICENSE)
![Electron](https://img.shields.io/badge/Electron-33-5ee0c0?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![LangChain](https://img.shields.io/badge/LangChain-deepagents-ffb86b)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-2ea043.svg)

**code review, but it's Duolingo.** an AI agent reads the whole change, then turns it into a course: a path of bite-sized lessons where you *predict* what the code does before it's explained, get instant ✅/❌ feedback, and every question you miss comes back until it sticks. you don't *review* the diff. you *speedrun understanding it.*

`🎯 predict` · `✅ instant feedback` · `🔁 mistakes come back` · `🔥 streaks` · `🪙 coins` · `💯 no cap`

</div>

---

## the vibe 😤

AI vibe-codes a PR in 4 seconds. you still have to *understand* it. and a raw git diff? unreadable. boring. zero dopamine. you scroll, your eyes glaze, you smash "Approve," you pray. 🙏

**Glassbox said nah.** 🛑

it spins up a [LangChain **deepagents**](https://github.com/langchain-ai/deepagentsjs) agent that actually *reads the whole change* — every file, every call site — then becomes your hype tour guide. big picture first, then pokeable code, hover-for-lore, value-tracing animations, and a full **gamified** loop that makes your brain go brrr while you learn.

it is **NOT** a reviewer. **NOT** a linter. **NOT** a vibe-killing quality scorer. its only job: get the change into your head with maximum dopamine and minimum effort. 🧠⚡️

## how a lesson works 🎓

the change becomes a **path**: a warm-up, one lesson per section, and your verdict at the end. lessons unlock in order (or jump ahead), and the next one is prepared in the background so **Start** is instant.

every lesson **teaches before it tests**. it opens with the idea in everyday words — plus the handful of jargon words you need — and only then goes near the real code. each block shows up simplified first, so the real one reads as a variation of something you already get:

| screen | what you do |
|--------|-------------|
| ✦ **the idea** | what this part is *for*, in plain words, with an analogy and a mini-glossary — no code |
| ◻ **simplified first** | a 4-line, made-up version of the block: the shape of the idea, none of the noise |
| 🎯 **predict** | now the real block — say what it does *before* the explanation |
| 📖 **learn** | then its story: what it does, with how-it-fits / who-calls-it / the gotcha one click away |
| 👆 **find it** | tap the line where a step happens |
| 🔗 **match** | pair each name with what it is |
| 🔀 **order** | put a value's journey through the code back in order |
| 🔢 **predict the value** | what does this variable hold *here*? |
| ✍️ **fill the gap** · **explain it** | complete an insight; explain it in your own words (AI-graded) |

a lesson stays sittable on purpose: at most 3 code blocks, 2 questions and 2 exercises — about a dozen screens.

hit **Check** → a green or red sheet tells you why → **Continue**. miss one and it comes back before the lesson ends; it also lands in **Practice** for later. finish and you get the results screen — XP, accuracy, time — plus your streak and daily goal. keyboard all the way: `1-4` to pick, `Enter` to check/continue, `Esc` to quit.

prefer a reference view? **Read** shows everything on one page, **Slides** one section at a time.

**your language** — Settings → *Lesson language*: follow your system, English or Deutsch. it switches the lesson UI *and* tells the agent which language to write every explanation, question and option in. already-generated lessons keep the language they were written in until you regenerate.

## why it goes hard 🚀

- 🗺️ **big picture first** — plain-language *what* + *why* before a single line of code
- 👆 **pokeable code** — hover any symbol for instant lore (what it is, where it came from, what it holds *right here*). tap to pin.
- 🎬 **value tracing** — watch a value *flow* through the change, line glowing as you step. cinematic.
- 🎚️ **depth dial** — one-line gist ⇄ deep dive, with "go deeper ⤓" for a fresh on-demand investigation
- ❓ **"wait, why this?"** — ask inline about any chunk, grounded in the real repo
- 🧠 **predict → check → explain** — active recall on every screen, Brilliant-style, so it actually sticks
- 🔍 **investigation trail** — see exactly what the agent read to explain each part

## the dopamine layer 🎰

this is the part your brain is addicted to:

| 🎮 | what |
|----|------|
| 🔥 **streak + daily goal** | finish a lesson a day to keep the flame lit; fill the ⚡ daily XP ring |
| 🪙 **coins + XP + levels** | every finished lesson pays out — more for first-try answers and perfect runs. rank up: Intern → … → **Legend** |
| 👑 **perfect lessons** | no mistakes = a crown on that node of the path |
| 🕹️ **the Arcade** | combos, crits, slot machine 🎰, Bug Blaster 3D, quests 🎯 — opt-in, and never inside a lesson |
| 🎰 **hidden vaults** · 🧰 **loot chests** | in Read mode: coins locked behind "Decode" mini-games, and a chest per mastered section |
| 🎮 **learning games** | Order the Flow · Match Up · Fill the Blank — built from the actual PR |
| 💸 **buy the verdict** | you can't just approve. finish every lesson, then **cash out** coins to mint the final Approve / Request-changes — earned, not free |

> tl;dr: it's Duolingo for diffs — and the only way to win is to *understand the code.* 💯

## 📦 install

grab a prebuilt installer from the [**Releases**](https://github.com/mikexkllr/glassbox-ai/releases) page:

| platform | file |
|----------|------|
| 🍎 **macOS** | `Glassbox-*-mac-*.dmg` (Apple Silicon + Intel) |
| 🪟 **Windows** | `Glassbox-*-win-x64.exe` (NSIS installer) |
| 🐧 **Linux** | `Glassbox-*-linux-x86_64.AppImage` |

every push to `main` ships a fresh build via GitHub Actions, and the app **auto-updates itself** in the background — it checks on launch and every 6h, downloads quietly, and swaps itself out when you quit (or right away if you click the notification).

macOS is the picky one: it only lets an app replace itself if that app is code-signed, so there auto-update rides on the Apple Developer ID. the release pipeline signs **and** notarizes the mac build the moment the Apple secrets are in the repo — see [**docs/signing.md**](docs/signing.md) for the one-time setup. until then the mac build ships unsigned: it runs fine, but you update it by grabbing the latest `.dmg`.

> unsigned builds make the OS nervous: **macOS** → right-click the app → *Open*; **Windows** → *More info* → *Run anyway*. a signed + notarized mac build just opens.

### your data 🔐

your code goes to the model provider *you* pick, and nowhere else — choose [Ollama](https://ollama.com) and it never leaves the machine. api keys are stored owner-only (`0600`), and encrypted with your OS keychain on top as soon as the build is code-signed — an unsigned build can't hold a keychain key across restarts, so glassbox checks before it trusts one ([details](SECURITY.md)). cached walkthroughs are owner-only too, since they quote your source. git access is read-only, through a throwaway worktree. **crash reporting is off unless you switch it on**, and even then it sends stack traces and a version number, no IP, no username. details in [SECURITY.md](SECURITY.md).

## run it 🏃

```bash
npm install
npm run dev      # 🚀 launches the Electron app
```

build installers yourself:

```bash
npm run pack              # unpacked app in dist/ (fast, for testing)
npm run dist              # full installers for the current platform
npm run dist:mac          # mac only — signs with your Developer ID if you have one
npm run dist:mac:unsigned # mac only — skips the keychain entirely
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

- 🤖 **agent** — `deepagents` (`createDeepAgent`) on LangGraph, reading the *real* checked-out repo with sandboxed `repo_*` tools (`read_file`, `grep`, `glob`, `ls`, `diff`), bounded by a per-section file budget. every section comes back by **calling** `submit_walkthrough_section` — a **Zod** schema, including a "predict before you read" question per code block. all structure from tool-calling, *never* model-emitted JSON text. work is **lazy**: a section generates when its lesson is next up.
- 🎓 **lessons** — `src/renderer/lib/lessons.ts` turns a section into an exercise queue (pure, so cached walkthroughs get lessons too); `components/lesson/` plays it. see [`docs/architecture.md`](docs/architecture.md) §8.
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
