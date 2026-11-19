# Contributing to Glassbox

Thanks for looking. Issues and pull requests are welcome — including small ones.

## Getting it running

```bash
npm install
npm run dev
```

You need Node 20+, a local git repository with at least two branches to point
Glassbox at, and a model provider. **You do not need to pay for one:** install
[Ollama](https://ollama.com), `ollama pull qwen2.5-coder`, pick *Ollama* in
Settings, and everything runs locally and free. That is the easiest way to work
on the UI without burning tokens.

## Before you open a pull request

```bash
npm run typecheck
npm run build
```

CI runs exactly these two on every pull request. `npm run build` only strips the
types rather than checking them, so the typecheck is the one that catches real
mistakes — run it.

There are no unit tests yet. If you change behaviour, say in the pull request
how you checked it by hand; `docs/architecture.md` has notes on driving the app
headlessly.

## Finding your way around

- `docs/architecture.md` — how the three processes fit together, where state
  lives, and how a lesson is assembled. Read this first.
- `docs/signing.md` — macOS signing, notarization and auto-update.
- `src/main/` — Electron main: the agent, git access, settings, the updater.
- `src/renderer/` — React UI. `lib/lessons.ts` turns a generated section into
  the lesson's screens; `components/lesson/` draws them.
- `src/shared/types.ts` — the contract both sides compile against. A change
  here usually wants a matching change in `src/main/agent/schema.ts`.

## Conventions

- Commit messages read `feat: …`, `fix: …`, `chore: …` and say *why* in the
  body when the why is not obvious.
- Comments explain the reason, not the mechanics. If a line is surprising,
  the comment should say what made it necessary.
- Any new user-facing string in the lesson path goes into **both** tables in
  `src/renderer/lib/i18n.ts`. The `Strings` interface is typed, so a missing
  translation is a compile error rather than a surprise at runtime.

## One thing to know

Every merge to `main` publishes a GitHub Release and the shipped app
auto-updates to it. So `main` is always live — hence the typecheck gate.

## Licence

By contributing you agree your work is published under this project's
[MIT licence](LICENSE). There is no CLA.
