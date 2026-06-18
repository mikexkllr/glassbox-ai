import { useGame } from '../game/store'
import { cn } from '../lib/files'

type G = ReturnType<typeof useGame.getState>

interface SkillNode {
  label: string
  threshold: number
  stat: (g: G) => number
}
interface Branch {
  id: string
  name: string
  emoji: string
  blurb: string
  color: string
  nodes: SkillNode[]
}

// Passive tree: nodes light up as the underlying stat crosses each threshold.
// No point-spending — it's a richer, motivating view of how deep you've gone.
const BRANCHES: Branch[] = [
  {
    id: 'tracer',
    name: 'Tracer',
    emoji: '🧭',
    blurb: 'follow the data',
    color: '#7c9cff',
    nodes: [
      { label: 'Pathfinder', threshold: 1, stat: (g) => g.countPrefix('trace:') },
      { label: 'Flow Reader', threshold: 5, stat: (g) => g.countPrefix('trace:') },
      { label: 'Data Whisperer', threshold: 12, stat: (g) => g.countPrefix('trace:') }
    ]
  },
  {
    id: 'cracker',
    name: 'Cracker',
    emoji: '🔓',
    blurb: 'break it open',
    color: '#ffb86b',
    nodes: [
      { label: 'Lockpick', threshold: 1, stat: (g) => g.countPrefix('vault:') },
      { label: 'Safecracker', threshold: 3, stat: (g) => g.countPrefix('vault:') },
      { label: 'Vault Buster', threshold: 6, stat: (g) => g.countPrefix('vault:') }
    ]
  },
  {
    id: 'scholar',
    name: 'Scholar',
    emoji: '🧠',
    blurb: 'lock it in',
    color: '#5ee0c0',
    nodes: [
      { label: 'Student', threshold: 3, stat: (g) => g.countPrefix('quizsolved:') },
      { label: 'Honor Roll', threshold: 10, stat: (g) => g.countPrefix('quizsolved:') },
      { label: 'Professor', threshold: 20, stat: (g) => g.countPrefix('quizsolved:') }
    ]
  },
  {
    id: 'tycoon',
    name: 'Tycoon',
    emoji: '🪙',
    blurb: 'stack it up',
    color: '#ffd23f',
    nodes: [
      { label: 'Saver', threshold: 500, stat: (g) => g.lifetimeCoins },
      { label: 'High Roller', threshold: 2000, stat: (g) => g.lifetimeCoins },
      { label: 'Tycoon', threshold: 5000, stat: (g) => g.lifetimeCoins }
    ]
  }
]

export default function SkillTree() {
  const g = useGame()
  const total = BRANCHES.reduce((n, b) => n + b.nodes.length, 0)
  const unlocked = BRANCHES.reduce((n, b) => n + b.nodes.filter((nd) => nd.stat(g) >= nd.threshold).length, 0)

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-ink-600">Master the craft — nodes light up as you go deeper. Pure progress, nothing to spend.</p>
        <span className="flex-none text-[12px] font-bold text-glass-accent2">{unlocked}/{total} skills</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {BRANCHES.map((b) => (
          <BranchCard key={b.id} branch={b} g={g} />
        ))}
      </div>
    </div>
  )
}

function BranchCard({ branch, g }: { branch: Branch; g: G }) {
  const got = branch.nodes.filter((n) => n.stat(g) >= n.threshold).length
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/50 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[20px]">{branch.emoji}</span>
        <span className="text-[13.5px] font-bold text-white">{branch.name}</span>
        <span className="text-[10px] text-ink-600">{branch.blurb}</span>
        <span className="ml-auto text-[11px] font-bold" style={{ color: branch.color }}>
          {got}/{branch.nodes.length}
        </span>
      </div>
      <div className="ml-1.5 space-y-2.5 border-l border-ink-700 pl-4">
        {branch.nodes.map((n, i) => {
          const val = n.stat(g)
          const done = val >= n.threshold
          const pct = Math.min(100, Math.round((val / n.threshold) * 100))
          return (
            <div key={i} className="relative">
              <span
                className="absolute -left-[23px] top-0.5 h-3 w-3 rounded-full border-2"
                style={{
                  background: done ? branch.color : '#11151d',
                  borderColor: done ? branch.color : '#252b3a',
                  boxShadow: done ? `0 0 8px ${branch.color}` : 'none'
                }}
              />
              <div className={cn('text-[12.5px] font-medium', done ? 'text-white' : 'text-ink-500')}>
                {n.label}
                {done && <span className="ml-1" style={{ color: branch.color }}>✓</span>}
              </div>
              {done ? (
                <div className="text-[10px] text-ink-600">unlocked</div>
              ) : (
                <>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: branch.color, opacity: 0.55 }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-600">
                    {val.toLocaleString()}/{n.threshold.toLocaleString()}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
