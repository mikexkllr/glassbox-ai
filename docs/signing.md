# Signing & notarizing the macOS build

Everything in the repo is already wired for this. What is missing is an Apple
identity, and that is the one part nobody can do for you: Apple will only hand a
"Developer ID Application" certificate to a paying member of the Apple Developer
Program. This page is the one-time setup, end to end.

## Why it matters

Two separate things hang off that certificate.

**Installing.** A macOS app that nobody signed is quarantined on download.
Gatekeeper says *"Glassbox cannot be opened because it is from an unidentified
developer"* (or, confusingly, *"is damaged and should be moved to the Trash"*),
and the only way past it is a right-click → *Open*. Signed **and notarized** —
Apple has seen the binary, scanned it, and issued a ticket we staple into the
bundle — it opens with a single double-click, like any other app.

**Updating.** macOS updates run through Squirrel.Mac, which swaps the running
`.app` for a freshly downloaded one. It refuses to do that unless both copies
carry a valid signature from the same team — otherwise any process that can write
to `/Applications` could replace the app. So on macOS, signing *is* the feature:
no certificate, no auto-update. (Windows and Linux auto-update either way.)

That is why `src/main/updater.ts` asks `codesign` about the running bundle before
it checks for updates at all: a signed release updates itself, an unsigned local
build stays quiet instead of downloading 100 MB it cannot install.

## First: see what you already have

```bash
security find-identity -v -p codesigning
```

Only a line starting with **`Developer ID Application:`** is the one that counts.
`Apple Development:` and `Apple Distribution:` are different certificates for
different jobs — testing on your own devices and shipping to the App Store — and
Apple's notary service rejects a build signed with either. If one of those is all
you have, you already have a paid membership and step 1 is done; you just need to
issue the Developer ID certificate in step 2.

> `build.mac.identity` in `package.json` is pinned to `"Developer ID Application"`
> for that reason. Left open, electron-builder does not recognise an
> `Apple Distribution` certificate as an Apple one, treats it as a custom signing
> certificate and signs the release with it — a build that looks signed, fails
> notarization, and cannot update itself. Pinned, it signs with the right
> certificate or leaves the build unsigned and says so.

## The one-time setup

### 1. Join the Apple Developer Program

<https://developer.apple.com/programs/> — 99 €/year, personal membership is
enough, and the Apple ID needs two-factor auth. Enrolment can take a day or two.

### 2. Create a "Developer ID Application" certificate

With Xcode installed, the short path:

**Xcode → Settings → Accounts → (your Apple ID) → Manage Certificates → + →
Developer ID Application.** It lands in your login keychain with its private key.

Without Xcode: Keychain Access → *Certificate Assistant → Request a Certificate
From a Certificate Authority*, save the CSR, upload it at
<https://developer.apple.com/account/resources/certificates/add>, pick
**Developer ID Application**, download the `.cer` and double-click it.

> Note the kind. *Apple Development* and *Apple Distribution* certificates are
> for the App Store and for testing — Gatekeeper rejects apps signed with them
> outside those channels. You want **Developer ID Application**.

### 3. Export it as a `.p12`

Keychain Access → **login → My Certificates** → right-click
*Developer ID Application: Your Name (TEAMID)* → **Export…** → save as
`glassbox-developer-id.p12` and give it a password. Exporting from *My
Certificates* (not *Certificates*) is what pulls the private key along with it.

Keep that file and its password somewhere safe — a password manager. If you lose
the private key, the certificate is dead and you issue a new one.

### 4. Collect the other three values

| value | where it comes from |
|---|---|
| **Apple ID** | the email you signed in with |
| **app-specific password** | <https://appleid.apple.com> → *Sign-In and Security → App-Specific Passwords* → **+**, call it `glassbox-notarize`. Looks like `abcd-efgh-ijkl-mnop`. Your real Apple password does not work here. |
| **Team ID** | <https://developer.apple.com/account> → *Membership details*. Ten characters, also the part in brackets in the certificate name. |

If your Apple ID belongs to more than one team, the Team ID has to be the team
whose Developer ID certificate you exported — the two travel together, and Apple
rejects the submission otherwise. Only a team's Account Holder can create a
Developer ID certificate, so on an organization team you may have to ask for it.

### 5. Put all five into GitHub Actions secrets

From the repo, with the [`gh`](https://cli.github.com) CLI. Piping into
`gh secret set` keeps the values out of your shell history:

```bash
base64 -i glassbox-developer-id.p12 | gh secret set MAC_CSC_LINK
```

```bash
gh secret set MAC_CSC_KEY_PASSWORD
```

```bash
gh secret set APPLE_ID
```

```bash
gh secret set APPLE_APP_SPECIFIC_PASSWORD
```

```bash
gh secret set APPLE_TEAM_ID
```

The last four prompt for the value and read it from stdin, so nothing is echoed.
(Or paste them under *Settings → Secrets and variables → Actions* in the GitHub
web UI.)

| secret | what it holds |
|---|---|
| `MAC_CSC_LINK` | the `.p12`, base64-encoded |
| `MAC_CSC_KEY_PASSWORD` | the password you set when exporting it |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 4 |
| `APPLE_TEAM_ID` | your ten-character Team ID |

### 6. Push, and watch the Release run

That is it — no code change. On the next push to `main`,
`.github/workflows/release.yml` imports the certificate into a throwaway keychain,
signs the app against the Hardened Runtime using
[`build/entitlements.mac.plist`](../build/entitlements.mac.plist), uploads it to
Apple's notary service (a few minutes), staples the ticket, and only then builds
the DMG and ZIP. A **Verify the macOS signature** step then checks the signature
and the stapled ticket, so a half-signed build fails the run instead of reaching
anyone.

Until those secrets exist, the same run still produces a working unsigned DMG and
leaves a warning in the run summary.

## One bump on the way

The first signed release **cannot** be delivered by auto-update to people running
an older unsigned build — that build will not even check, by design. Everyone
already on an unsigned Glassbox downloads the new DMG once by hand. From there on
updates are automatic.

## Building a signed app locally

With the certificate in your login keychain:

```bash
npm run dist:mac
```

It signs, warns that it skipped notarization, and leaves the installers in
`dist/`. To notarize locally as well, export the same three values first:

```bash
APPLE_ID='you@example.com' APPLE_APP_SPECIFIC_PASSWORD='abcd-efgh-ijkl-mnop' APPLE_TEAM_ID='XXXXXXXXXX' npm run dist:mac
```

To build without touching your keychain at all — handy for UI testing, and the
result deliberately never auto-updates:

```bash
npm run dist:mac:unsigned
```

## Checking a build by hand

```bash
codesign -d --verbose=2 /Applications/Glassbox.app
```

Look for `Authority=Developer ID Application: …` — that exact line is what the
updater's probe looks for, and what Squirrel.Mac needs.

```bash
spctl -a -vvv -t install /Applications/Glassbox.app
```

`source=Notarized Developer ID` means a stranger's Mac will open it without a
single warning. `source=Developer ID` means it is signed but the ticket is
missing, so a Mac that has never seen the app still asks.

```bash
xcrun stapler validate /Applications/Glassbox.app
```

## Windows

Windows has the same problem with a different name: an unsigned installer makes
SmartScreen say *"Windows protected your PC — unknown publisher"*, and the user
has to click *More info → Run anyway*. Unlike macOS, auto-update works without a
signature, so this is about trust at install time, not about updating.

The pipeline is already wired for it. Two secrets and nothing else changes:

| secret | what it holds |
|---|---|
| `WIN_CSC_LINK` | an Authenticode certificate as a base64 `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | its password |

electron-builder reads those two on Windows only, and ignores them while they
are empty — which is why the mac certificate is handed over as `CSC_LINK`
*only* on the macOS runner. `CSC_LINK` is not mac-specific to electron-builder:
on a Windows runner it would be taken as the Authenticode certificate and the
build would fail trying to sign with an Apple key.

Getting a certificate is the hard part, and it is not like Apple's:

- **[Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/)**
  — Microsoft's hosted signing service, billed monthly, with no hardware token
  to plug in. Individuals have to pass an identity check that wants several
  years of verifiable history. The friendliest option for CI if you qualify;
  electron-builder supports it through `win.azureSignOptions`.
- **An OV certificate from a CA** (DigiCert, Sectigo, …) — since the CA/Browser
  Forum tightened the rules, the private key has to live on a hardware token or
  a cloud HSM, which makes signing from a GitHub runner awkward and is why the
  `.pfx` route is getting rarer.
- **Nothing.** SmartScreen's warning softens as a given installer builds up
  reputation, and plenty of open-source desktop apps ship unsigned on Windows.

## When it goes wrong

**`skipped macOS application code signing  reason=Identity name is specified, but no valid identity with this name in the keychain`**
The expected one. It lists what it did find: there is no
`Developer ID Application` certificate yet, and the pinned identity stops it from
reaching for a certificate of the wrong kind. The build carries on unsigned.

**`skipped macOS application code signing  reason=cannot find valid "Developer ID Application" identity`**
Same thing with the identity pin removed — or, in CI, `MAC_CSC_LINK` is unset or
is not valid base64.

**`skipped macOS notarization  reason=notarize options were unable to be generated`**
Signing worked, but `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`
are not all set.

**Notarization rejected.** Ask Apple what it disliked — the submission ID is in
the build log:

```bash
xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

**`You must first sign the relevant contracts`** — a new agreement is waiting in
App Store Connect. Accept it there and re-run.

**The app opens but a native module fails to load.** The Hardened Runtime is
stricter than an unsigned build; the entitlement that usually covers it is
`com.apple.security.cs.disable-library-validation`, already in
`build/entitlements.mac.plist`. Add new entitlements there, and only there, so
the main app and its helper processes stay in sync.

**Updates never arrive even though the app is signed.** The published version has
to be strictly higher than the installed one. CI derives it from the workflow run
number (`0.1.<run_number>`), so that holds automatically. Check the running app's
log for `[updater]` lines — it prints every step, including why it skipped.
