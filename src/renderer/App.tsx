import { useEffect } from 'react'
import { useStore } from './store'
import { useGame } from './game/store'
import Onboarding from './components/Onboarding'
import Walkthrough from './components/Walkthrough'
import SettingsModal from './components/Settings'
import FxLayer from './components/FxLayer'

export default function App() {
  const screen = useStore((s) => s.screen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const init = useStore((s) => s.init)
  const handleAgentEvent = useStore((s) => s.handleAgentEvent)

  useEffect(() => {
    init()
    useGame.getState().touchDay()
    const off = window.glassbox.onAgentEvent(handleAgentEvent)
    return off
  }, [])

  return (
    <div className="h-full">
      {screen === 'onboarding' ? <Onboarding /> : <Walkthrough />}
      {settingsOpen && <SettingsModal />}
      <FxLayer />
    </div>
  )
}
