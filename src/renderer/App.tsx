import { useEffect } from 'react'
import { useStore } from './store'
import { useGame } from './game/store'
import Onboarding from './components/Onboarding'
import Walkthrough from './components/Walkthrough'
import SettingsModal from './components/Settings'
import TelemetryConsent, { initSentryRenderer } from './components/TelemetryConsent'
import ToastStack from './components/ToastStack'
import FxLayer from './components/FxLayer'
import CursorTrail from './components/CursorTrail'

export default function App() {
  const screen = useStore((s) => s.screen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const settings = useStore((s) => s.settings)
  const init = useStore((s) => s.init)
  const handleAgentEvent = useStore((s) => s.handleAgentEvent)

  useEffect(() => {
    init().then(() => {
      const s = useStore.getState().settings
      if (s?.telemetry) initSentryRenderer()
    })
    useGame.getState().touchDay()
    const off = window.glassbox.onAgentEvent(handleAgentEvent)
    return off
  }, [])

  // Show consent dialog on first launch (telemetry not yet decided).
  const needsConsent = settings !== null && settings?.telemetry === undefined

  return (
    <div className="h-full">
      {screen === 'onboarding' ? <Onboarding /> : <Walkthrough />}
      {settingsOpen && <SettingsModal />}
      {needsConsent && <TelemetryConsent />}
      <ToastStack />
      <FxLayer />
      <CursorTrail />
    </div>
  )
}
