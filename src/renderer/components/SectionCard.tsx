import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SectionPlan, WalkChunk, WalkthroughSection } from '@shared/types'
import { useStore } from '../store'
import { cn } from '../lib/files'
import PokeableCode from './PokeableCode'
import ValueTrace from './ValueTrace'
import SelfCheck from './SelfCheck'
import WhyThis from './WhyThis'
import AgentStatus from './AgentStatus'
import TrailChip from './InvestigationTrail'
import Quiz from './Quiz'
import Insights from './Insights'
import { useGame } from '../game/store'

export default function SectionCard({ plan, index }: { plan: SectionPlan; index: number }) {
  const section = useStore((s) => s.sections[plan.id])
  const live = useStore((s) => s.live[plan.id])
  const depth = useStore((s) => s.depth)
  const walked = useStore((s) => s.walked.includes(plan.id))
  const ensureSection = useStore((s) => s.ensureSection)
  const markWalked = useStore((s) => s.markWalked)

  const rewardOnce = useGame((s) => s.rewardOnce)
  const unlock = useGame((s) => s.unlock)

  const [open, setOpen] = useState(index === 0)

  // trace state for this section
  const [activeValueId, setActiveValueId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (open && !section && !live?.busy) ensureSection(plan)
  }, [open, section, live?.busy])

  useEffect(() => {
    if (open && section) {
      markWalked(plan.id)
      rewardOnce(`section:open:${plan.id}`, 10, { reason: 'section unlocked', sound: 'whoosh' })
      unlock('first_section')
    }
  }, [open, section])

  const activeValue = section?.traceableValues.find((v) => v.id === activeValueId) ?? null
  const activeStep = activeValue?.steps[stepIndex]

  return (
    <section id={`sec-${plan.id}`} className="scroll-mt-4 rounded-xl border border-ink-700 bg-ink-850/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="no-drag flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px]',
            walked ? 'bg-glass-accent2/20 text-glass-accent2' : 'bg-ink-800 text-ink-600'
          )}
        >
          {walked ? '✓' : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-white">{plan.title}</h3>
          <p className="truncate text-[12.5px] text-ink-600">{plan.teaser}</p>
        </div>
        <span className="mt-1 text-ink-600">{open ? '▾' : '▸'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-5">
              {!section && <AgentStatus scope={plan.id} />}

              {section && (
                <>
                  <p className="text-[14px] leading-relaxed text-gray-200">
                    {depth === 'gist' ? section.plainSummaryGist : section.plainSummaryDeep}
                  </p>

                  {section.insights?.length > 0 && <Insights insights={section.insights} sectionId={plan.id} />}

                  {section.selfCheck && <SelfCheck check={section.selfCheck} sectionId={plan.id} />}

                  <div className="space-y-3">
                    {section.chunks.map((chunk) => (
                      <ChunkCard
                        key={chunk.id}
                        chunk={chunk}
                        explanations={section.inlineExplanations}
                        traceLines={traceLinesFor(activeValue, chunk.file)}
                        activeLine={activeStep && activeStep.file === chunk.file ? activeStep.line : null}
                      />
                    ))}
                  </div>

                  {section.traceableValues.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-ink-600">Trace a value</div>
                      {section.traceableValues.map((v) => (
                        <ValueTrace
                          key={v.id}
                          value={v}
                          active={activeValueId === v.id}
                          stepIndex={activeValueId === v.id ? stepIndex : 0}
                          onActivate={() => {
                            setActiveValueId((cur) => (cur === v.id ? null : v.id))
                            setStepIndex(0)
                          }}
                          onStep={(i) => {
                            setStepIndex(i)
                            if (i === v.steps.length - 1) {
                              rewardOnce(`trace:${plan.id}:${v.id}`, 15, { reason: 'traced it!', sound: 'coin', confetti: true })
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {section.quiz?.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-ink-600">Test yourself</div>
                      {section.quiz.map((q, qi) => (
                        <Quiz key={q.id} q={q} sectionId={plan.id} index={qi} />
                      ))}
                    </div>
                  )}

                  <TrailChip trail={section.investigationTrail} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function traceLinesFor(value: WalkthroughSection['traceableValues'][number] | null, file: string): Set<number> {
  const set = new Set<number>()
  if (!value) return set
  for (const s of value.steps) if (s.file === file) set.add(s.line)
  return set
}

function ChunkCard({
  chunk,
  explanations,
  traceLines,
  activeLine
}: {
  chunk: WalkChunk
  explanations: WalkthroughSection['inlineExplanations']
  traceLines: Set<number>
  activeLine: number | null
}) {
  const [storyOpen, setStoryOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-850 px-3 py-2">
        <span className="text-[13px] font-medium text-gray-200">{chunk.title}</span>
        <span className="truncate font-mono text-[11px] text-ink-600">
          {chunk.file}:{chunk.startLine}-{chunk.endLine}
        </span>
        <button
          onClick={() => setStoryOpen((o) => !o)}
          className="no-drag ml-auto rounded bg-ink-800 px-2 py-0.5 text-[11px] text-glass-accent hover:bg-ink-700"
        >
          {storyOpen ? 'hide story' : 'story ▸'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {storyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-ink-700 bg-ink-850/40"
          >
            <div className="space-y-2 p-3 text-[13px] leading-relaxed">
              <StoryLine label="What it does" text={chunk.story.what} />
              <StoryLine label="How it fits" text={chunk.story.fits} />
              <StoryLine label="What calls it" text={chunk.story.calledBy} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PokeableCode
        file={chunk.file}
        startLine={chunk.startLine}
        endLine={chunk.endLine}
        explanations={explanations}
        traceLines={traceLines}
        activeLine={activeLine}
      />

      <div className="border-t border-ink-700 bg-ink-850 px-3 py-2">
        <WhyThis context={`${chunk.title} (${chunk.file}:${chunk.startLine}-${chunk.endLine}). ${chunk.story.what}`} />
      </div>
    </div>
  )
}

function StoryLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wide text-ink-600">{label}: </span>
      <span className="text-gray-200">{text}</span>
    </div>
  )
}
