import { cn } from '../../lib/files'

type Tone = 'primary' | 'success' | 'danger' | 'warm' | 'ghost'

const TONE: Record<Tone, string> = {
  primary: 'bg-glass-accent2 text-ink-950 shadow-[0_4px_0_0_#2c8f78] hover:brightness-110',
  success: 'bg-[#3fb950] text-ink-950 shadow-[0_4px_0_0_#1f7a33] hover:brightness-110',
  danger: 'bg-glass-del text-white shadow-[0_4px_0_0_#9e2a24] hover:brightness-110',
  warm: 'bg-glass-warm text-ink-950 shadow-[0_4px_0_0_#b8793a] hover:brightness-110',
  ghost: 'border-2 border-ink-700 bg-transparent text-gray-300 shadow-[0_4px_0_0_#252b3a] hover:bg-ink-850'
}

/** The chunky, pressable button the whole lesson loop is driven by. */
export function Btn({
  tone = 'primary',
  disabled,
  onClick,
  className,
  children,
  title
}: {
  tone?: Tone
  disabled?: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'no-drag rounded-2xl px-6 py-3 text-[14px] font-extrabold uppercase tracking-wide transition-[transform,box-shadow,filter] active:translate-y-[3px] active:shadow-none',
        disabled ? 'cursor-not-allowed bg-ink-800 text-ink-600 shadow-[0_4px_0_0_#141821]' : TONE[tone],
        className
      )}
    >
      {children}
    </button>
  )
}

export type TileState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'

/** An answer tile: options, word-bank chips, match cards. */
export function tileClass(state: TileState): string {
  return cn(
    'no-drag rounded-xl border-2 text-left transition-colors shadow-[0_3px_0_0_rgba(0,0,0,0.35)]',
    state === 'idle' && 'border-ink-700 bg-ink-900 text-gray-200 hover:border-ink-600 hover:bg-ink-850',
    state === 'selected' && 'border-glass-accent bg-glass-accent/10 text-white',
    state === 'correct' && 'border-[#3fb950] bg-[#3fb950]/10 text-white',
    state === 'wrong' && 'border-glass-del bg-glass-del/10 text-white',
    state === 'dim' && 'border-ink-800 bg-ink-900/50 text-ink-600'
  )
}

/** The small all-caps label above every screen. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-glass-accent2">{children}</div>
}

/** Number key badge on a tile — 1-9 picks it. */
export function KeyBadge({ n, state }: { n: number; state: TileState }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 flex-none items-center justify-center rounded-md border text-[11px] font-bold',
        state === 'correct'
          ? 'border-[#3fb950] text-[#3fb950]'
          : state === 'wrong'
            ? 'border-glass-del text-glass-del'
            : state === 'selected'
              ? 'border-glass-accent text-glass-accent'
              : 'border-ink-700 text-ink-600'
      )}
    >
      {n}
    </span>
  )
}
