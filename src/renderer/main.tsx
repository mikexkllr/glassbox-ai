import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import App from './App'
import './styles.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    this.setState({ error })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#0a0c10] p-8 text-center">
          <p className="text-[15px] font-semibold text-white">Something went wrong</p>
          <p className="max-w-sm text-[12px] text-gray-500 line-clamp-4">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-gray-300 hover:border-ink-500 hover:text-white"
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
