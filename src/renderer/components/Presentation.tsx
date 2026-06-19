import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import OverviewCard from './OverviewCard'
import SectionCard from './SectionCard'
import { cn } from '../lib/files'

/** Brilliant-style one-at-a-time presentation of the change. Overview, then a slide per section. */
export default function Presentation() {
  const overview = useStore((s) => s.overview)
  const slide = useStore((s) => s.slideIndex)
  const setSlide = useStore((s) => s.setSlide)
  const walked = useStore((s) => s.walked)
  const setChatContext = useStore((s) => s.setChatContext)

  const plans = overview?.sections ?? []
  const total = plans.length + 1
  const atOverview = slide === 0
  const plan = atOverview ? null : plans[slide - 1]
  const isLast = slide >= total - 1

  // Anchor the Ask chat to the slide on screen.
  useEffect(() => {
    setChatContext(plan ? `Section "${plan.title}" — ${plan.teaser}` : 'The big-picture overview of the whole change.')
  }, [slide, plan])
  useEffect(() => () => setChatContext(null), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (document.querySelector('[data-overlay]')) return // a lesson/arcade/modal is open
      if (e.key === 'ArrowRight') setSlide(slide + 1)
      else if (e.key === 'ArrowLeft') setSlide(slide - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slide])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* scope breadcrumb */}
      <div className="mx-auto w-full max-w-3xl px-6 pt-4 text-[11px] text-ink-600">
        <span className="text-glass-accent">Walkthrough</span>
        <span className="mx-1">›</span>
        {atOverview ? (
          <span className="text-gray-300">✦ Big picture</span>
        ) : (
          <>
            <span className="text-gray-300">
              Section {slide}/{plans.length}
            </span>
            <span className="mx-1">›</span>
            <span className="text-gray-200">{plan?.title}</span>
          </>
        )}
      </div>

      {/* slide */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pb-6 pt-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
            >
              {atOverview ? (
                <>
                  <OverviewCard />
                  <p className="mt-6 text-center text-[13px] text-ink-600">
                    {plans.length} sections ahead — press <kbd className="rounded bg-ink-800 px-1.5 py-0.5">→</kbd> or Next to begin
                  </p>
                </>
              ) : plan ? (
                <SectionCard key={plan.id} plan={plan} index={slide - 1} presentation />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* nav bar */}
      <footer className="flex flex-none items-center gap-4 border-t border-ink-800 bg-ink-900/60 px-6 py-3">
        <button
          onClick={() => setSlide(slide - 1)}
          disabled={slide === 0}
          className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-gray-300 hover:border-ink-600 disabled:opacity-30"
        >
          ← Back
        </button>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const done = i > 0 && plans[i - 1] && walked.includes(plans[i - 1].id)
            return (
              <button
                key={i}
                onClick={() => setSlide(i)}
                title={i === 0 ? 'Big picture' : plans[i - 1]?.title}
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  i === slide ? 'w-7 bg-glass-accent' : done ? 'w-2.5 bg-glass-accent2' : 'w-2.5 bg-ink-700 hover:bg-ink-600'
                )}
              />
            )
          })}
        </div>

        <div className="w-[120px] text-right">
          {isLast ? (
            <span className="text-[12px] text-ink-600">that's everything 🎉</span>
          ) : (
            <button
              onClick={() => setSlide(slide + 1)}
              className="no-drag rounded-lg bg-glass-accent px-5 py-2 text-[13px] font-semibold text-ink-950 hover:brightness-110"
            >
              {atOverview ? 'Start →' : 'Next →'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
