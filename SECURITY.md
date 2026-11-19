# Security

## Reporting a vulnerability

Please report privately through GitHub's
[**Report a vulnerability**](https://github.com/mikexkllr/glassbox-ai/security/advisories/new)
form rather than opening a public issue. I will confirm receipt and keep you
posted on a fix.

## What this app handles

Glassbox is a desktop app that reads your source code and sends parts of it to
a model provider you choose. Worth knowing, in plain terms:

- **Your API keys** live in `config.json` in the app's data directory
  (`~/Library/Application Support/glassbox/` on macOS). The file is always
  written owner-only (`0600`). On a **code-signed** build the credentials in it
  are additionally encrypted with Electron's `safeStorage`, which keeps its key
  in the operating system's keychain.

  An **unsigned** build cannot do that reliably. The keychain entry is bound to
  the app's code signature, so an app without one is handed a fresh key on every
  launch: encryption appears to work and yesterday's data is unreadable. Rather
  than quietly swallowing your keys on restart, Glassbox writes a small canary
  value on every save and only starts encrypting once it has seen one survive a
  launch. Until then the credentials stay in clear text inside the owner-only
  file. The same applies where there is no keychain at all, as on some Linux
  setups.
- **Your code** goes to the provider you configured, and nowhere else. Choose
  Ollama and it never leaves the machine. Generated walkthroughs are cached in
  the same data directory, also owner-only, because they quote your source.
- **Git access is read-only.** The agent reads the feature branch through a
  throwaway worktree; it never writes to your repository.
- **Crash reporting is opt-in** and off unless you turn it on. When on, it
  sends stack traces and app version to the maintainer's Sentry project, with
  `sendDefaultPii` disabled — no IP address, no username. Stack traces can
  still carry file paths, so leave it off if that matters to you.
- The **Sentry DSN** in this repository is not a secret: a DSN only lets a
  client submit events, and it ships inside every published build anyway.

## Releases

Fixes go out on the latest release; there are no maintained older branches.
macOS builds are signed and notarized once the Apple credentials are configured
(`docs/signing.md`); Windows builds are not signed yet, so SmartScreen will warn.
