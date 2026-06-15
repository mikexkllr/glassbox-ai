import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import TrailChip from './InvestigationTrail'

export default function ChatPanel() {
  const open = useStore((s) => s.chatOpen)
  const setOpen = useStore((s) => s.setChatOpen)
  const history = useStore((s) => s.chatHistory)
  const busy = useStore((s) => s.chatBusy)
  const send = useStore((s) => s.sendChat)
  const [q, setQ] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, busy])

  const submit = () => {
    if (!q.trim() || busy) return
    send(q)
    setQ('')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 420 }}
          animate={{ x: 0 }}
          exit={{ x: 420 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="flex h-full w-[420px] flex-none flex-col border-l border-ink-800 bg-ink-900"
        >
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <div className="text-[13px] font-medium text-white">Ask anything about this code</div>
            <button onClick={() => setOpen(false)} className="no-drag text-ink-600 hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {history.length === 0 && (
              <div className="mt-6 text-center text-[13px] text-ink-600">
                Grounded in the real repo. Try:
                <div className="mt-2 space-y-1 text-[12px] text-glass-accent">
                  <div>"What would break if I reverted this?"</div>
                  <div>"Where is this function actually used?"</div>
                  <div>"Walk me through the happy path."</div>
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={
                    m.role === 'user'
                      ? 'inline-block max-w-[85%] rounded-lg bg-glass-accent/20 px-3 py-2 text-left text-[13px] text-gray-100'
                      : 'inline-block max-w-[95%] rounded-lg bg-ink-850 px-3 py-2 text-[13px] leading-relaxed text-gray-200'
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === 'assistant' && m.trail && <TrailChip trail={m.trail} />}
                </div>
              </div>
            ))}
            {busy && <div className="text-[12px] text-ink-600">Glassbox is looking into the repo…</div>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-ink-800 p-3">
            <div className="flex gap-2">
              <textarea
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Ask…"
                className="no-drag h-12 flex-1 resize-none rounded-lg border border-ink-700 bg-ink-950 p-2 text-[13px] outline-none focus:border-glass-accent/50"
              />
              <button
                onClick={submit}
                disabled={busy}
                className="no-drag rounded-lg bg-glass-accent px-3 text-[13px] font-medium text-ink-950 hover:brightness-110 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
