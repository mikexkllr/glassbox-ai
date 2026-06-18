import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { TRAIL_STYLES } from '../game/cosmetics'

interface Particle {
  id: number
  x: number
  y: number
  glyph?: string
  color?: string
}

let pid = 1

/** A click-through overlay that drops fading particles behind the cursor when a
 * trail cosmetic is equipped. Throttled and capped so it stays cheap. */
export default function CursorTrail() {
  const trail = useGame((s) => s.equipped.trail)
  const [parts, setParts] = useState<Particle[]>([])
  const last = useRef(0)

  useEffect(() => {
    if (!trail || trail === 'none') {
      setParts([])
      return
    }
    const style = TRAIL_STYLES[trail]
    if (!style) return

    const onMove = (e: MouseEvent) => {
      const now = performance.now()
      if (now - last.current < 55) return
      last.current = now
      const id = pid++
      const color =
        style.colors && style.colors.length ? style.colors[id % style.colors.length] : undefined
      setParts((p) => [...p.slice(-18), { id, x: e.clientX, y: e.clientY, glyph: style.glyph, color }])
      window.setTimeout(() => setParts((p) => p.filter((q) => q.id !== id)), 760)
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [trail])

  if (!trail || trail === 'none') return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[190] overflow-hidden">
      {parts.map((p) =>
        p.glyph ? (
          <span
            key={p.id}
            className="trail-fx absolute select-none text-[18px]"
            style={{ left: p.x, top: p.y }}
          >
            {p.glyph}
          </span>
        ) : (
          <span
            key={p.id}
            className="trail-fx absolute"
            style={{
              left: p.x,
              top: p.y,
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: p.color,
              boxShadow: `0 0 8px ${p.color}`
            }}
          />
        )
      )}
    </div>
  )
}
