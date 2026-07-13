import * as THREE from 'three'

/** A ready-to-render three.js scene bound to a canvas, with resize + disposal handled. */
export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Current canvas size in CSS pixels. */
  size: () => { width: number; height: number }
  /** Start the render loop. `onFrame` runs before each render with (dt, elapsed) in seconds. */
  start: (onFrame?: (dt: number, elapsed: number) => void) => void
  dispose: () => void
}

export function createStage(canvas: HTMLCanvasElement, opts?: { fov?: number; z?: number }): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts?.fov ?? 50, 1, 0.1, 100)
  camera.position.z = opts?.z ?? 8

  let width = 0
  let height = 0
  const fit = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === width && h === height) return
    width = w
    height = h
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(canvas)

  let raf = 0
  let disposed = false

  return {
    renderer,
    scene,
    camera,
    size: () => ({ width, height }),
    start: (onFrame) => {
      const clock = new THREE.Clock()
      const tick = () => {
        if (disposed) return
        const dt = Math.min(clock.getDelta(), 0.05)
        onFrame?.(dt, clock.elapsedTime)
        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    },
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      disposeObject(scene)
      renderer.dispose()
    }
  }
}

/** Recursively free geometries and materials under an object. */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose?.()
  })
}

/** Convert a mouse event on the canvas to normalized device coordinates (-1..1). */
export function eventToNdc(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): THREE.Vector2 {
  const r = canvas.getBoundingClientRect()
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
}
