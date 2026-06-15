import { useStore } from '../store'

export default function Onboarding() {
  const repoPath = useStore((s) => s.repoPath)
  const branches = useStore((s) => s.branches)
  const base = useStore((s) => s.base)
  const feature = useStore((s) => s.feature)
  const busy = useStore((s) => s.busyDiff)
  const error = useStore((s) => s.error)
  const settings = useStore((s) => s.settings)

  const pickRepo = useStore((s) => s.pickRepo)
  const setBase = useStore((s) => s.setBase)
  const setFeature = useStore((s) => s.setFeature)
  const start = useStore((s) => s.startWalkthrough)
  const openSettings = useStore((s) => s.openSettings)

  const repoName = repoPath?.split('/').pop()

  return (
    <div className="flex h-full flex-col">
      <div className="drag h-10 w-full flex-none" />
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <div className="mb-2 text-[40px]">🔍</div>
            <h1 className="text-[30px] font-bold tracking-tight text-white">Glassbox</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-400">
              Don't read the diff. Let a guide who's already read the whole change
              <br /> walk you through it — until it just clicks.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-700 bg-ink-850/50 p-5">
            <Step n={1} label="Choose a repository">
              <button
                onClick={pickRepo}
                className="no-drag w-full rounded-lg border border-dashed border-ink-600 bg-ink-900 px-4 py-3 text-left text-[14px] hover:border-glass-accent/50"
              >
                {repoPath ? (
                  <span className="text-gray-100">
                    📁 {repoName} <span className="text-ink-600">— {repoPath}</span>
                  </span>
                ) : (
                  <span className="text-ink-600">Click to pick a local git repository…</span>
                )}
              </button>
            </Step>

            {branches.length > 0 && (
              <Step n={2} label="Pick the branches to compare">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <select value={base} onChange={(e) => setBase(e.target.value)} className="select no-drag">
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <span className="text-ink-600">→</span>
                  <select value={feature} onChange={(e) => setFeature(e.target.value)} className="select no-drag">
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-ink-600">base (what you have) → feature (what changed)</p>
              </Step>
            )}

            {error && <div className="mb-3 rounded-lg bg-glass-del/15 px-3 py-2 text-[12.5px] text-glass-del">{error}</div>}

            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={start}
                disabled={!repoPath || !base || !feature || busy}
                className="no-drag flex-1 rounded-lg bg-glass-accent px-5 py-3 text-[14px] font-semibold text-ink-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Computing the diff…' : 'Start walkthrough →'}
              </button>
              <button
                onClick={() => openSettings(true)}
                className="no-drag rounded-lg border border-ink-700 px-4 py-3 text-[13px] text-gray-300 hover:border-ink-600"
              >
                ⚙ {settings?.provider ?? 'Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-800 text-[11px] text-glass-accent">
          {n}
        </span>
        <span className="text-[12px] font-medium text-gray-300">{label}</span>
      </div>
      {children}
    </div>
  )
}
