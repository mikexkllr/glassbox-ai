import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'

export default function ToastStack() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[300] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 24, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex max-w-[340px] items-start gap-2.5 rounded-xl border border-glass-del/30 bg-ink-950/95 px-3.5 py-2.5 shadow-xl backdrop-blur"
          >
            <span className="mt-px shrink-0 text-[13px] text-glass-del">⚠</span>
            <span className="min-w-0 flex-1 text-[12px] leading-snug text-gray-300 line-clamp-3">
              {t.message}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-[11px] text-ink-600 hover:text-white"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
