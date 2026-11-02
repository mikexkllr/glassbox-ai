import { useEffect, useState } from 'react'
import {
  PROVIDERS,
  PROVIDER_GROUPS,
  providerBaseUrl,
  type Provider,
  type ProviderWire,
  type Settings,
  type WireChoice
} from '@shared/types'
import { useStore } from '../store'

/** Wires whose endpoint the reader may point somewhere else. */
const EDITABLE_ENDPOINT: ProviderWire[] = ['openai', 'responses', 'anthropic', 'google', 'ollama', 'bedrock-proxy']

/** The protocols a multi-protocol gateway can be pinned to. */
const WIRE_CHOICES: { id: WireChoice; label: string }[] = [
  { id: 'auto', label: 'Auto (ask the catalog)' },
  { id: 'openai', label: 'OpenAI /chat/completions' },
  { id: 'responses', label: 'OpenAI /responses' },
  { id: 'anthropic', label: 'Anthropic /messages' },
  { id: 'google', label: 'Gemini generateContent' }
]

export default function SettingsModal() {
  const stored = useStore((s) => s.settings)
  const save = useStore((s) => s.saveSettings)
  const close = () => useStore.getState().openSettings(false)

  const [draft, setDraft] = useState<Settings | null>(stored)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [loaded, setLoaded] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => setDraft(stored), [stored])
  if (!draft) return null

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch })
  const spec = PROVIDERS[draft.provider]

  // Credentials and endpoints are keyed by provider, so switching away and back
  // keeps whatever was typed for each one.
  const setKey = (value: string) => set({ apiKeys: { ...draft.apiKeys, [draft.provider]: value } })
  const setBaseUrl = (value: string) => set({ baseUrls: { ...draft.baseUrls, [draft.provider]: value } })
  const setWire = (value: WireChoice) => set({ wires: { ...draft.wires, [draft.provider]: value } })

  // Dismissing with unsaved edits (e.g. a freshly typed API key) should ask
  // before throwing the changes away, rather than silently discarding them.
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)
  const requestClose = () => (dirty ? setConfirmClose(true) : close())

  const suggestions = loaded.length ? loaded : spec.models
  const showEndpoint = spec.multiWire || EDITABLE_ENDPOINT.includes(spec.wire)
  const needsKey = !spec.keyless && spec.wire !== 'bedrock' && spec.wire !== 'vertex'

  const onProvider = (provider: Provider) => {
    setLoaded([])
    setTest(null)
    setDraft({ ...draft, provider, model: PROVIDERS[provider].models[0] ?? '' })
  }

  const loadModels = async () => {
    setLoadingModels(true)
    const res = await window.glassbox.listModels(draft)
    setLoaded(res.models)
    setTest(res.ok ? null : { ok: false, message: res.message ?? 'Could not list models' })
    setLoadingModels(false)
  }

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

        <div className="mb-4">
          <label className="mb-1 block text-[12px] font-medium text-gray-300">Provider</label>
          {PROVIDER_GROUPS.map((group) => {
            const members = (Object.keys(PROVIDERS) as Provider[]).filter((p) => PROVIDERS[p].group === group.id)
            return (
              <div key={group.id} className="mb-2.5">
                <div className="mb-1 text-[10.5px] uppercase tracking-wide text-ink-600">{group.label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {members.map((p) => (
                    <button
                      key={p}
                      onClick={() => onProvider(p)}
                      className={`no-drag rounded-lg border px-2 py-2 text-[12px] ${
                        draft.provider === p
                          ? 'border-glass-accent bg-glass-accent/15 text-glass-accent'
                          : 'border-ink-700 text-gray-300 hover:border-ink-600'
                      }`}
                    >
                      {PROVIDERS[p].label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="mt-1.5 text-[11px] text-ink-600">{spec.blurb}</p>
        </div>

        <Field
          label={spec.wire === 'azure' ? 'Deployment name' : 'Model'}
          hint={
            loaded.length > 24
              ? `${loaded.length} models loaded — start typing to filter.`
              : undefined
          }
        >
          <div className="flex gap-2">
            <input
              list="model-list"
              value={draft.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder={spec.models[0] ?? 'model id…'}
              className="input"
            />
            <button
              onClick={loadModels}
              disabled={loadingModels}
              className="no-drag whitespace-nowrap rounded-lg border border-ink-700 px-3 text-[12px] hover:border-ink-600 disabled:opacity-50"
            >
              {loadingModels ? '…' : 'Load models'}
            </button>
          </div>
          <datalist id="model-list">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>

        {loaded.length > 0 && loaded.length <= 24 && (
          <div className="-mt-2 mb-4 flex flex-wrap gap-1.5">
            {loaded.map((m) => (
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

        {needsKey && (
          <Field
            label={`${spec.label} API key`}
            hint={[
              spec.keyUrl ? `Get one at ${spec.keyUrl}.` : '',
              spec.envKeys?.length ? `Or set ${spec.envKeys.join(' / ')} in your environment.` : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              type="password"
              value={draft.apiKeys?.[draft.provider] ?? ''}
              onChange={(e) => setKey(e.target.value)}
              placeholder="paste your key…"
              className="input"
            />
          </Field>
        )}

        {showEndpoint && (
          <Field
            label={
              spec.multiWire
                ? 'Inference root'
                : spec.wire === 'bedrock-proxy'
                  ? 'Converse endpoint URL'
                  : 'Base URL'
            }
            hint={
              spec.multiWire
                ? 'One subscription, several protocols — /openai/v1, /anthropic/v1 and /google/v1beta are appended per model.'
                : undefined
            }
          >
            <input
              value={draft.baseUrls?.[draft.provider] ?? ''}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={spec.baseUrl ?? 'https://…'}
              className="input"
            />
          </Field>
        )}

        {spec.multiWire && (
          <Field label="Protocol" hint="Auto reads the gateway's catalog. Pin it only if a model is routed wrong.">
            <select
              value={draft.wires?.[draft.provider] ?? 'auto'}
              onChange={(e) => setWire(e.target.value as WireChoice)}
              className="input no-drag"
            >
              {WIRE_CHOICES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {draft.provider === 'ollama' && (
          <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850/40 p-3">
            <div className="mb-2 text-[12px] font-semibold text-glass-accent">Ollama controls</div>
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

        {(draft.provider === 'bedrock' || draft.provider === 'bedrock-proxy') && (
          <Field
            label="AWS region"
            hint={draft.provider === 'bedrock-proxy' ? 'Used by the SDK to build requests; any valid region works behind a proxy.' : undefined}
          >
            <input value={draft.bedrockRegion ?? ''} onChange={(e) => set({ bedrockRegion: e.target.value })} placeholder="us-east-1" className="input" />
          </Field>
        )}

        {draft.provider === 'bedrock' && (
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

        {draft.provider === 'azure' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Resource endpoint" hint="https://<resource>.openai.azure.com">
              <input value={draft.azureEndpoint ?? ''} onChange={(e) => set({ azureEndpoint: e.target.value })} placeholder="https://…" className="input" />
            </Field>
            <Field label="API version">
              <input value={draft.azureApiVersion ?? ''} onChange={(e) => set({ azureApiVersion: e.target.value })} placeholder="2024-10-21" className="input" />
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
              Generates the next section while you explore the current one — no waiting between chapters. Ideal for a local
              model or a flat-rate subscription.
              {spec.group !== 'local' && spec.group !== 'gateway' && (
                <span className="text-glass-warm"> ⚠ On per-token providers this spends more upfront.</span>
              )}
            </span>
          </span>
        </label>

        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-ink-700 bg-ink-850/40 p-3">
          <input
            type="checkbox"
            checked={draft.telemetry ?? false}
            onChange={(e) => set({ telemetry: e.target.checked })}
            className="no-drag mt-0.5 h-4 w-4"
          />
          <span>
            <span className="text-[13px] font-medium text-gray-200">Anonymous crash reporting</span>
            <span className="mt-0.5 block text-[11px] text-ink-600">
              Send error reports to Sentry so we can find and fix bugs. No code content or API keys are ever included.
            </span>
          </span>
        </label>

        {test && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${test.ok ? 'bg-glass-add/15 text-glass-add' : 'bg-glass-del/15 text-glass-del'}`}>
            {test.message}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button onClick={runTest} disabled={testing} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] hover:border-ink-600 disabled:opacity-50">
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <span className="truncate text-[11px] text-ink-600">{providerBaseUrl(draft) || spec.label}</span>
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
