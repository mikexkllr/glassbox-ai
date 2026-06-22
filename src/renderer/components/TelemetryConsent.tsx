import { motion } from 'framer-motion'
import { useStore } from '../store'
import * as Sentry from '@sentry/electron/renderer'
import { SENTRY_DSN, SENTRY_RELEASE } from '@shared/sentry-config'

let sentryRendererInitialized = false

export function initSentryRenderer() {
  if (sentryRendererInitialized) return
  sentryRendererInitialized = true
  Sentry.init({ dsn: SENTRY_DSN, release: SENTRY_RELEASE })
}

export default function TelemetryConsent() {
  const settings = useStore((s) => s.settings)
  const saveSettings = useStore((s) => s.saveSettings)

  async function decide(telemetry: boolean) {
    if (!settings) return
    await saveSettings({ ...settings, telemetry })
    if (telemetry) initSentryRenderer()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 230, damping: 22 }}
        className="mx-4 w-full max-w-[420px] rounded-2xl border border-ink-700 bg-ink-900 p-7 shadow-2xl"
      >
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-3xl">🛰️</span>
          <div>
            <h2 className="text-[16px] font-bold text-white">Help us squash bugs</h2>
            <p className="text-[12px] text-ink-500">takes 2 seconds to decide</p>
          </div>
        </div>

        {/* main copy */}
        <p className="mb-4 text-[13.5px] leading-relaxed text-gray-300">
          When Glassbox crashes or throws an error,{' '}
          <span className="font-semibold text-glass-accent">anonymous crash reports</span> sent to{' '}
          <span className="font-medium text-white">Sentry</span> are the <em>only</em> way we can
          see what broke and ship a fix — we have no other telemetry.
        </p>

        {/* what's collected box */}
        <div className="mb-5 space-y-2 rounded-xl border border-ink-700 bg-ink-950 p-3 text-[11.5px]">
          <div className="flex items-start gap-2">
            <span className="mt-px text-glass-add">✓</span>
            <span className="text-gray-400">
              <span className="font-medium text-gray-200">Collected:</span> error message, stack
              trace, OS &amp; app version, the action you were doing
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-px text-glass-del">✗</span>
            <span className="text-gray-400">
              <span className="font-medium text-gray-200">Never collected:</span> API keys, repo
              content, code, or anything that can identify you
            </span>
          </div>
        </div>

        {/* buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => decide(true)}
            className="no-drag w-full rounded-xl bg-glass-accent py-2.5 text-[13.5px] font-bold text-ink-950 transition hover:brightness-110 active:scale-[0.98]"
          >
            Enable crash reporting
          </button>
          <button
            onClick={() => decide(false)}
            className="no-drag w-full rounded-xl border border-ink-700 py-2.5 text-[13px] font-medium text-gray-500 transition hover:border-ink-500 hover:text-gray-300 active:scale-[0.98]"
          >
            No thanks, keep it off
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-600">
          You can change this anytime in{' '}
          <button
            onClick={() => useStore.getState().openSettings(true)}
            className="no-drag underline hover:text-gray-400"
          >
            Settings
          </button>
          .
        </p>
      </motion.div>
    </div>
  )
}
