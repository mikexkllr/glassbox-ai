// Self-contained sound effects via the Web Audio API — no audio files (CSP-safe).
// Punchy, arcade-y blips designed for maximum dopamine.

let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
}

function ac(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.18,
  slideTo?: number,
  delay = 0
) {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

type Sound =
  | 'coin'
  | 'correct'
  | 'wrong'
  | 'levelup'
  | 'purchase'
  | 'whoosh'
  | 'tick'
  | 'combo'
  | 'reveal'
  | 'jackpot'

export function play(name: Sound) {
  switch (name) {
    case 'coin':
      blip(880, 0.09, 'square', 0.16)
      blip(1320, 0.12, 'square', 0.14, undefined, 0.05)
      break
    case 'tick':
      blip(520, 0.05, 'triangle', 0.1)
      break
    case 'correct':
      blip(660, 0.1, 'triangle', 0.18)
      blip(880, 0.1, 'triangle', 0.18, undefined, 0.09)
      blip(1320, 0.16, 'triangle', 0.18, undefined, 0.18)
      break
    case 'wrong':
      blip(200, 0.22, 'sawtooth', 0.14, 90)
      break
    case 'combo':
      blip(990, 0.08, 'square', 0.14, 1480)
      break
    case 'reveal':
      blip(440, 0.16, 'sine', 0.14, 880)
      break
    case 'whoosh':
      blip(300, 0.18, 'sine', 0.08, 1200)
      break
    case 'levelup':
      ;[523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'square', 0.16, undefined, i * 0.1))
      break
    case 'purchase':
      blip(440, 0.1, 'square', 0.16)
      blip(587, 0.1, 'square', 0.16, undefined, 0.08)
      blip(880, 0.2, 'square', 0.18, undefined, 0.16)
      break
    case 'jackpot':
      ;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
        blip(f, 0.18, 'square', 0.16, undefined, i * 0.07)
      )
      ;[784, 1047].forEach((f, i) => blip(f, 0.4, 'triangle', 0.12, undefined, 0.5 + i * 0.05))
      break
  }
}
