import { useEffect, useState } from 'react'
import { PROVIDER_MODELS, PROVIDER_LABELS, type Provider, type Settings } from '@shared/types'
import { useStore } from '../store'

export default function SettingsModal() {
  const stored = useStore((s) => s.settings)
  const save = useStore((s) => s.saveSettings)
  const close = () => useStore.getState().openSettings(false)

  const [draft, setDraft] = useState<Settings | null>(stored)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => setDraft(stored), [stored])
  if (!draft) return null

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch })
  const models = PROVIDER_MODELS[draft.provider]

  const onProvider = (provider: Provider) => set({ provider, model: PROVIDER_MODELS[provider][0] })

  const runTest = async () => {
    setTesting(true)
    await save(draft)
    setTest(await window.glassbox.testModel())
    setTesting(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onClick={close}>
      <div
        className="max-h-full w-[560px] overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Settings</h2>
          <button onClick={close} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        </div>

        <Field label="Provider">
          <div className="grid grid-cols-3 gap-2">
            {(['anthropic', 'opencodezen', 'ollama', 'bedrock', 'vertex'] as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => onProvider(p)}
                className={`no-drag rounded-lg border px-2 py-2 text-[12px] ${
                  draft.provider === p
                    ? 'border-glass-accent bg-glass-accent/15 text-glass-accent'
                    : 'border-ink-700 text-gray-300 hover:border-ink-600'
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Model">
          <input
            list="model-list"
            value={draft.model}
            onChange={(e) => set({ model: e.target.value })}
            className="input"
          />
          <datalist id="model-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>

        {draft.provider === 'anthropic' && (
          <Field label="Anthropic API key" hint="Or set ANTHROPIC_API_KEY in your environment.">
            <input
              type="password"
              value={draft.anthropicApiKey ?? ''}
              onChange={(e) => set({ anthropicApiKey: e.target.value })}
              placeholder="sk-ant-…"
              className="input"
            />
          </Field>
        )}

        {draft.provider === 'opencodezen' && (
          <>
            <Field label="OpenCode Zen API key" hint="Get one at opencode.ai/auth. Or set OPENCODE_ZEN_API_KEY.">
              <input
                type="password"
                value={draft.opencodeZenApiKey ?? ''}
                onChange={(e) => set({ opencodeZenApiKey: e.target.value })}
                placeholder="paste your key…"
                className="input"
              />
            </Field>
            <Field label="Base URL">
              <input
                value={draft.opencodeZenBaseUrl ?? ''}
                onChange={(e) => set({ opencodeZenBaseUrl: e.target.value })}
                className="input"
              />
            </Field>
          </>
        )}

        {draft.provider === 'ollama' && (
          <Field label="Ollama base URL">
            <input value={draft.ollamaBaseUrl ?? ''} onChange={(e) => set({ ollamaBaseUrl: e.target.value })} className="input" />
          </Field>
        )}

        {draft.provider === 'bedrock' && (
          <>
            <Field label="AWS region">
              <input value={draft.bedrockRegion ?? ''} onChange={(e) => set({ bedrockRegion: e.target.value })} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Access key id" hint="Optional — uses default chain if blank.">
                <input value={draft.awsAccessKeyId ?? ''} onChange={(e) => set({ awsAccessKeyId: e.target.value })} className="input" />
              </Field>
              <Field label="Secret access key">
                <input
                  type="password"
                  value={draft.awsSecretAccessKey ?? ''}
                  onChange={(e) => set({ awsSecretAccessKey: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
          </>
        )}

        {draft.provider === 'vertex' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="GCP project">
              <input value={draft.vertexProject ?? ''} onChange={(e) => set({ vertexProject: e.target.value })} className="input" />
            </Field>
            <Field label="Location">
              <input value={draft.vertexLocation ?? ''} onChange={(e) => set({ vertexLocation: e.target.value })} className="input" />
            </Field>
          </div>
        )}

        <Field label={`Investigation budget: ${draft.maxFilesPerSection} files / section`} hint="How deep Glassbox digs per section.">
          <input
            type="range"
            min={3}
            max={30}
            value={draft.maxFilesPerSection}
            onChange={(e) => set({ maxFilesPerSection: Number(e.target.value) })}
            className="no-drag w-full"
          />
        </Field>

        {test && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${test.ok ? 'bg-glass-add/15 text-glass-add' : 'bg-glass-del/15 text-glass-del'}`}>
            {test.message}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button onClick={runTest} disabled={testing} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] hover:border-ink-600 disabled:opacity-50">
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            onClick={async () => {
              await save(draft)
              close()
            }}
            className="no-drag ml-auto rounded-lg bg-glass-accent px-5 py-2 text-[13px] font-medium text-ink-950 hover:brightness-110"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12px] font-medium text-gray-300">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-600">{hint}</p>}
    </div>
  )
}
