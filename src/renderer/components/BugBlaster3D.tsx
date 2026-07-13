import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as THREE from 'three'
import { createStage, disposeObject, eventToNdc } from '../lib/threeStage'
import { useGame } from '../game/store'
import { play } from '../game/sfx'
import { cn } from '../lib/files'

const ROUND_SECONDS = 30
const MAX_BUGS = 7
const GOLD_CHANCE = 0.14
const COINS_PER_BUG = 4

// Bugs roam inside this box, centered on the origin (camera looks down -z).
const BOUNDS = new THREE.Vector3(4.6, 2.4, 2.2)

interface Bug {
  group: THREE.Group
  wingL: THREE.Mesh
  wingR: THREE.Mesh
  velocity: THREE.Vector3
  wobble: number
  golden: boolean
  dead: boolean
}

interface Shard {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
}

function makeBug(golden: boolean): Bug {
  const group = new THREE.Group()
  const bodyMat = golden
    ? new THREE.MeshStandardMaterial({ color: 0xf5b93c, metalness: 0.8, roughness: 0.25, emissive: 0x5a3a00 })
    : new THREE.MeshStandardMaterial({ color: 0x51d88a, metalness: 0.2, roughness: 0.5, emissive: 0x0a2e18 })
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), bodyMat)
  body.scale.set(1, 0.75, 1.25)
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), bodyMat)
  head.position.set(0, 0.08, 0.38)
  group.add(head)

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat)
    eye.position.set(0.08 * sx, 0.16, 0.5)
    group.add(eye)
  }

  const wingMat = new THREE.MeshStandardMaterial({
    color: golden ? 0xffe9a8 : 0xbfe8ff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    roughness: 0.2
  })
  const wingGeo = new THREE.CircleGeometry(0.3, 12)
  const wingL = new THREE.Mesh(wingGeo, wingMat)
  wingL.position.set(-0.28, 0.22, 0)
  const wingR = new THREE.Mesh(wingGeo, wingMat)
  wingR.position.set(0.28, 0.22, 0)
  group.add(wingL, wingR)

  group.position.set(
    (Math.random() * 2 - 1) * BOUNDS.x,
    (Math.random() * 2 - 1) * BOUNDS.y,
    (Math.random() * 2 - 1) * BOUNDS.z
  )
  const speed = golden ? 2.6 : 1.5
  const velocity = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, (Math.random() * 2 - 1) * 0.5)
    .normalize()
    .multiplyScalar(speed)

  return { group, wingL, wingR, velocity, wobble: Math.random() * Math.PI * 2, golden, dead: false }
}

type Phase = 'ready' | 'play' | 'done'

export default function BugBlaster3D({ onBack }: { onBack: () => void }) {
  const award = useGame((s) => s.award)
  const unlock = useGame((s) => s.unlock)
  const sfxOn = useGame((s) => s.sfxOn)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [reward, setReward] = useState(0)
  const scoreRef = useRef(0)

  useEffect(() => {
    if (phase !== 'play') return
    const canvas = canvasRef.current
    if (!canvas) return

    const stage = createStage(canvas, { fov: 55, z: 7 })
    stage.scene.fog = new THREE.Fog(0x0a0d14, 8, 14)

    stage.scene.add(new THREE.AmbientLight(0x8899bb, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(4, 6, 6)
    stage.scene.add(key)
    const fill = new THREE.PointLight(0x58a6ff, 20, 30)
    fill.position.set(-5, -3, 2)
    stage.scene.add(fill)

    // starfield backdrop
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(240 * 3)
    for (let i = 0; i < starPos.length; i += 3) {
      starPos[i] = (Math.random() * 2 - 1) * 12
      starPos[i + 1] = (Math.random() * 2 - 1) * 7
      starPos[i + 2] = -4 - Math.random() * 6
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8b949e, size: 0.035 }))
    stage.scene.add(stars)

    const bugs: Bug[] = []
    const shards: Shard[] = []
    const spawn = () => {
      const bug = makeBug(Math.random() < GOLD_CHANCE)
      bugs.push(bug)
      stage.scene.add(bug.group)
    }
    for (let i = 0; i < MAX_BUGS; i++) spawn()

    const shardGeo = new THREE.TetrahedronGeometry(0.09)
    const burst = (at: THREE.Vector3, golden: boolean) => {
      const mat = new THREE.MeshBasicMaterial({ color: golden ? 0xffd75e : 0x51d88a, transparent: true })
      for (let i = 0; i < 10; i++) {
        const mesh = new THREE.Mesh(shardGeo, mat.clone())
        mesh.position.copy(at)
        stage.scene.add(mesh)
        shards.push({
          mesh,
          velocity: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
            .normalize()
            .multiplyScalar(3 + Math.random() * 2),
          life: 0.45
        })
      }
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(0, 0)

    const onMove = (e: MouseEvent) => {
      const ndc = eventToNdc(e, canvas)
      pointer.set(ndc.x, ndc.y)
    }
    const onClick = (e: MouseEvent) => {
      raycaster.setFromCamera(eventToNdc(e, canvas), stage.camera)
      const alive = bugs.filter((b) => !b.dead)
      const hits = raycaster.intersectObjects(alive.map((b) => b.group), true)
      if (hits.length === 0) {
        if (sfxOn) play('tick')
        return
      }
      let node: THREE.Object3D | null = hits[0].object
      while (node && !alive.some((b) => b.group === node)) node = node.parent
      const bug = alive.find((b) => b.group === node)
      if (!bug) return
      bug.dead = true
      burst(bug.group.position, bug.golden)
      stage.scene.remove(bug.group)
      disposeObject(bug.group)
      const points = bug.golden ? 3 : 1
      scoreRef.current += points
      setScore(scoreRef.current)
      if (sfxOn) play(bug.golden ? 'jackpot' : 'correct')
      setTimeout(spawn, 350 + Math.random() * 500)
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)

    const startedAt = performance.now()
    let lastShownSecond = ROUND_SECONDS
    let finished = false

    stage.start((dt, t) => {
      // countdown
      const left = Math.max(0, ROUND_SECONDS - (performance.now() - startedAt) / 1000)
      const shown = Math.ceil(left)
      if (shown !== lastShownSecond) {
        lastShownSecond = shown
        setTimeLeft(shown)
      }
      if (left <= 0 && !finished) {
        finished = true
        setPhase('done')
        return
      }

      // camera parallax follows the mouse
      stage.camera.position.x += (pointer.x * 1.2 - stage.camera.position.x) * 0.05
      stage.camera.position.y += (pointer.y * 0.7 - stage.camera.position.y) * 0.05
      stage.camera.lookAt(0, 0, 0)

      for (const bug of bugs) {
        if (bug.dead) continue
        bug.wobble += dt * 3
        bug.group.position.addScaledVector(bug.velocity, dt)
        bug.group.position.y += Math.sin(bug.wobble) * dt * 0.6
        // bounce off the walls
        const p = bug.group.position
        if (Math.abs(p.x) > BOUNDS.x) bug.velocity.x *= -1
        if (Math.abs(p.y) > BOUNDS.y) bug.velocity.y *= -1
        if (Math.abs(p.z) > BOUNDS.z) bug.velocity.z *= -1
        p.clamp(BOUNDS.clone().negate(), BOUNDS)
        bug.group.lookAt(p.clone().add(bug.velocity))
        const flap = Math.sin(t * 26 + bug.wobble) * 0.9
        bug.wingL.rotation.z = 0.5 + flap * 0.5
        bug.wingR.rotation.z = -0.5 - flap * 0.5
      }

      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i]
        s.life -= dt
        if (s.life <= 0) {
          stage.scene.remove(s.mesh)
          ;(s.mesh.material as THREE.Material).dispose()
          shards.splice(i, 1)
          continue
        }
        s.mesh.position.addScaledVector(s.velocity, dt)
        s.mesh.rotation.x += dt * 8
        s.mesh.rotation.y += dt * 6
        ;(s.mesh.material as THREE.MeshBasicMaterial).opacity = s.life / 0.45
      }
    })

    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
      shardGeo.dispose()
      stage.dispose()
    }
  }, [phase])

  // hand out the coins exactly once when the round ends
  useEffect(() => {
    if (phase !== 'done') return
    const s = scoreRef.current
    if (s > 0) {
      const got = award(s * COINS_PER_BUG, { reason: `${s} bugs zapped! 🪰`, sound: 'jackpot', confetti: s >= 10 })
      setReward(got)
      if (s >= 15) unlock('exterminator')
    }
  }, [phase])

  const startRound = () => {
    scoreRef.current = 0
    setScore(0)
    setTimeLeft(ROUND_SECONDS)
    setReward(0)
    setPhase('play')
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="no-drag text-[12px] text-ink-600 hover:text-white">
          ← games
        </button>
        <span className="text-[13px] font-semibold text-white">Bug Blaster 3D</span>
        {phase === 'play' && (
          <span className="ml-auto flex items-center gap-3 font-mono text-[13px] tabular-nums">
            <span className="font-bold text-glass-accent2">🪰 {score}</span>
            <span className={cn('font-bold', timeLeft <= 5 ? 'text-glass-del' : 'text-ink-500')}>⏱ {timeLeft}s</span>
          </span>
        )}
      </div>

      {phase === 'ready' && (
        <div className="py-8 text-center">
          <div className="text-[52px]">🪰</div>
          <p className="mx-auto mb-1 max-w-xs text-[13px] text-gray-200">
            Bugs escaped into 3D space. Zap as many as you can in {ROUND_SECONDS} seconds.
          </p>
          <p className="mb-5 text-[11.5px] text-ink-600">
            green bug = 1 point · golden bug = 3 · +{COINS_PER_BUG}🪙 per point
          </p>
          <button
            onClick={startRound}
            className="no-drag rounded-xl bg-glass-accent px-6 py-2.5 text-[14px] font-bold text-ink-950 hover:brightness-110"
          >
            Start blasting
          </button>
        </div>
      )}

      {phase === 'play' && (
        <canvas
          ref={canvasRef}
          className="h-[300px] w-full cursor-crosshair rounded-xl border border-ink-700"
          style={{ background: 'radial-gradient(ellipse at 50% 40%, #131a2a 0%, #0a0d14 75%)' }}
        />
      )}

      {phase === 'done' && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
          <div className="text-[48px]">{score >= 15 ? '🏆' : score > 0 ? '🎉' : '🫠'}</div>
          <div className="text-[20px] font-black text-white">{score} bugs zapped</div>
          {reward > 0 ? (
            <div className="text-[16px] font-black text-glass-warm">+{reward}🪙</div>
          ) : (
            <div className="text-[13px] text-ink-600">not a single one… they're still out there</div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={startRound} className="no-drag rounded-lg bg-glass-accent px-4 py-2 text-[13px] font-semibold text-ink-950 hover:brightness-110">
              Play again
            </button>
            <button onClick={onBack} className="no-drag rounded-lg border border-ink-700 px-4 py-2 text-[13px] hover:border-ink-600">
              Back
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
