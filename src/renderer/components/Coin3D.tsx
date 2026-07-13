import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createStage } from '../lib/threeStage'

/** A spinning 3D gold coin on a transparent canvas. Purely decorative. */
export default function Coin3D({ size = 96, spin = 1 }: { size?: number; spin?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const stage = createStage(canvas, { fov: 40, z: 4.6 })

    stage.scene.add(new THREE.AmbientLight(0xfff2d0, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 5)
    stage.scene.add(key)
    const rim = new THREE.DirectionalLight(0xffb347, 1.4)
    rim.position.set(-4, -2, -3)
    stage.scene.add(rim)

    const gold = new THREE.MeshStandardMaterial({ color: 0xf5b93c, metalness: 0.85, roughness: 0.25, emissive: 0x3a2500 })
    const goldDark = new THREE.MeshStandardMaterial({ color: 0xc98f1e, metalness: 0.9, roughness: 0.35 })

    const coin = new THREE.Group()
    const face = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.22, 48), [goldDark, gold, gold])
    coin.add(face)
    // raised rim ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.09, 12, 48), gold)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.11
    coin.add(ring)
    const ring2 = ring.clone()
    ring2.position.y = -0.11
    coin.add(ring2)
    // embossed square "glassbox" mark
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), goldDark)
    mark.position.y = 0.13
    coin.add(mark)
    const mark2 = mark.clone()
    mark2.position.y = -0.13
    coin.add(mark2)

    coin.rotation.z = Math.PI / 2 // face the camera
    stage.scene.add(coin)

    stage.start((_dt, t) => {
      coin.rotation.y = t * 1.6 * spin
      coin.position.y = Math.sin(t * 2) * 0.12
      coin.rotation.z = Math.PI / 2 + Math.sin(t * 1.3) * 0.12
    })
    return () => stage.dispose()
  }, [spin])

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="mx-auto block" />
}
