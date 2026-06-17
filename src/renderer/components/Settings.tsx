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
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => setDraft(stored), [stored])
  if (!draft) return null

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch })

  // Dismissing with unsaved edits (e.g. a freshly typed API key) should ask
  // before throwing the changes away, rather than silently discarding them.
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)
  const requestClose = () => (dirty ? setConfirmClose(true) : close())
  const models = PROVIDER_MODELS[draft.provider]

  const onProvider = (provider: Provider) => set({ provider, model: PROVIDER_MODELS[provider][0] })

  const runTest = async () => {
    setTesting(true)
    await save(draft)
    setTest(await window.glassbox.testModel())
    setTesting(false)
  }

  return (
    <>
    <div data-overlay className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onClick={requestClose}>
      <div
        className="max-h-full w-[560px] overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Settings</h2>
          <button onClick={requestClose} className="no-drag text-ink-600 hover:text-white">
            ✕
          </button>
        </div>

        <Field label="Provider">
          <div className="grid grid-cols-3 gap-2">
            {(['anthropic', 'opencodezen', 'ollama', 'bedrock', 'bedrock-proxy', 'vertex'] as Provider[]).map((p) => (
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
          <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850/40 p-3">
            <div className="mb-2 text-[12px] font-semibold text-glass-accent">Ollama controls</div>
            <Field label="Base URL">
              <div className="flex gap-2">
                <input value={draft.ollamaBaseUrl ?? ''} onChange={(e) => set({ ollamaBaseUrl: e.target.value })} className="input" />
                <button
                  onClick={async () => {
                    setLoadingModels(true)
                    const res = await window.glassbox.listOllamaModels(draft.ollamaBaseUrl || 'http://localhost:11434')
                    setOllamaModels(res.models)
                    if (!res.ok) setTest({ ok: false, message: `Ollama: ${res.message ?? 'could not list models'}` })
                    setLoadingModels(false)
                  }}
                  className="no-drag whitespace-nowrap rounded-lg border border-ink-700 px-3 text-[12px] hover:border-ink-600 disabled:opacity-50"
                  disabled={loadingModels}
                >
                  {loadingModels ? '…' : 'Load models'}
                </button>
              </div>
            </Field>
            {ollamaModels.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {ollamaModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => set({ model: m })}
                    className={`no-drag rounded-full px-2.5 py-1 text-[11px] ${
                      draft.model === m ? 'bg-glass-accent text-ink-950' : 'border border-ink-700 text-gray-300 hover:border-ink-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Context window (num_ctx)" value={draft.ollamaNumCtx ?? 8192} step={512} min={512} onChange={(v) => set({ ollamaNumCtx: v })} />
              <NumField label="Max tokens (num_predict, -1=∞)" value={draft.ollamaNumPredict ?? -1} step={128} min={-1} onChange={(v) => set({ ollamaNumPredict: v })} />
              <NumField label="Temperature" value={draft.ollamaTemperature ?? 0} step={0.1} min={0} max={2} onChange={(v) => set({ ollamaTemperature: v })} />
              <NumField label="Repeat penalty" value={draft.ollamaRepeatPenalty ?? 1.1} step={0.05} min={0.5} max={2} onChange={(v) => set({ ollamaRepeatPenalty: v })} />
              <NumField label="top_p" value={draft.ollamaTopP ?? 0.9} step={0.05} min={0} max={1} onChange={(v) => set({ ollamaTopP: v })} />
              <NumField label="top_k" value={draft.ollamaTopK ?? 40} step={1} min={0} onChange={(v) => set({ ollamaTopK: v })} />
            </div>
            <Field label="Keep alive" hint='How long to keep the model loaded, e.g. "5m", "1h", "-1" for forever.'>
              <input value={draft.ollamaKeepAlive ?? ''} onChange={(e) => set({ ollamaKeepAlive: e.target.value })} className="input" />
            </Field>
          </div>
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

        {draft.provider === 'bedrock-proxy' && (
          <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850/40 p-3">
            <div className="mb-2 text-[12px] font-semibold text-glass-accent">Bedrock Converse via proxy</div>
            <p className="mb-3 text-[11px] text-ink-600">
              For a gateway in front of AWS Bedrock that speaks the Converse API but authenticates with a bearer token (no
              SigV4). Use the Claude model id as the model above.
            </p>
            <Field label="Converse endpoint URL" hint="Your proxy's base URL, e.g. https://bedrock.mycorp.com">
              <input
                value={draft.bedrockProxyEndpoint ?? ''}
                onChange={(e) => set({ bedrockProxyEndpoint: e.target.value })}
                placeholder="https://…"
                className="input"
              />
            </Field>
            <Field label="API key" hint="Sent as Authorization: Bearer …. Or set AWS_BEARER_TOKEN_BEDROCK.">
              <input
                type="password"
                value={draft.bedrockProxyApiKey ?? ''}
                onChange={(e) => set({ bedrockProxyApiKey: e.target.value })}
                placeholder="paste your key…"
                className="input"
              />
            </Field>
            <Field label="Region" hint="Used by the SDK to build requests; any valid region works behind a proxy.">
              <input
                value={draft.bedrockRegion ?? ''}
                onChange={(e) => set({ bedrockRegion: e.target.value })}
                placeholder="us-east-1"
                className="input"
              />
            </Field>
          </div>
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

        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-700 bg-ink-850/40 p-3">
          <input
            type="checkbox"
            checked={draft.prefetchNext}
            onChange={(e) => set({ prefetchNext: e.target.checked })}
            className="no-drag mt-0.5 h-4 w-4"
          />
          <span>
            <span className="text-[13px] font-medium text-gray-200">Prefetch next section in the background</span>
            <span className="mt-0.5 block text-[11px] text-ink-600">
              Generates the next section while you explore the current one — no waiting between chapters. Ideal for local Ollama.
              {draft.provider !== 'ollama' && (
                <span className="text-glass-warm"> ⚠ On cloud providers this spends more tokens upfront.</span>
              )}
            </span>
          </span>
        </label>

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

    {confirmClose && (
      <div
        data-overlay
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6"
        onClick={() => setConfirmClose(false)}
      >
        <div
          className="w-[340px] rounded-2xl border border-ink-700 bg-ink-900 p-5 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[15px] font-semibold text-white">Save your changes?</div>
          <p className="mt-1 text-[12.5px] text-ink-600">
            You edited the settings (including any credentials) but haven't saved yet.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setConfirmClose(false)
                close()
              }}
              className="no-drag flex-1 rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-gray-300 hover:border-ink-600"
            >
              Discard
            </button>
            <button
              onClick={async () => {
                await save(draft)
                setConfirmClose(false)
                close()
              }}
              className="no-drag flex-1 rounded-lg bg-glass-accent px-4 py-2 text-[13px] font-medium text-ink-950 hover:brightness-110"
            >
              Save
            </button>
          </div>
          <button
            onClick={() => setConfirmClose(false)}
            className="no-drag mt-3 text-[11.5px] text-ink-600 hover:text-white"
          >
            keep editing
          </button>
        </div>
      </div>
    )}
    </>
  )
}

function NumField({
  label,
  value,
  step,
  min,
  max,
  onChange
}: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-1">
      <label className="mb-1 block text-[11px] font-medium text-gray-300">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input no-drag"
      />
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
