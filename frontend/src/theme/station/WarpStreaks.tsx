// 워프 연출 (#D — 우주선으로 다른 정거장에 갈 때). 세기(0 ~ 1)를 받아 화면 가운데에서 바깥으로 쏟아지는 별빛 줄기, 살짝 넓어지는 화각,
// 정거장이 바뀌는 순간의 보랏빛 섬광을 그린다. 세기는 우주선 비행이 정한다(scene/shipFlight.ts warpLevel). 세기 0이면 아무것도 없다.
// 카메라를 따라다니며 장면 위에 겹쳐 그린다(짧은 순간이라 정거장을 가려도 된다). 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, MeshBasicMaterial, PlaneGeometry, type Group, type Mesh, type PerspectiveCamera } from 'three'
import { noRaycast } from '../../scene/runtime'

const N = 200
/** 줄기가 놓이는 깊이(카메라 앞) */
const DEPTH = 30
/** 최대 세기에서 화각이 넓어지는 정도(도) */
const FOV_KICK = 6

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** source.warp = 세기, source.fovKick = 화각도 넓힐지(입장 연출처럼 화각을 따로 다루는 동안은 false) */
export function WarpStreaks({ source }: { source: { warp: number; fovKick?: boolean } }) {
  const group = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const res = useMemo(() => {
    const rnd = seeded(91)
    // 줄기마다 [방향 각도, 시작 반지름(화면 비율), 흐름 위상, 속도]
    const seeds = Array.from({ length: N }, () => [rnd() * Math.PI * 2, 0.08 + rnd() * 0.9, rnd(), 0.6 + rnd() * 0.8] as const)
    const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(N * 6), 3))
    const mat = new LineBasicMaterial({ color: 0xeee6ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, depthTest: false, fog: false })
    const flashGeo = new PlaneGeometry(2, 2)
    const flashMat = new MeshBasicMaterial({ color: 0xd8c4ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, depthTest: false, fog: false })
    return { seeds, geo, mat, flashGeo, flashMat }
  }, [])
  useEffect(
    () => () => {
      res.geo.dispose()
      res.mat.dispose()
      res.flashGeo.dispose()
      res.flashMat.dispose()
    },
    [res],
  )
  // 워프 전 화각(돌려놓을 값)
  const baseFov = useRef<number | null>(null)

  useFrame(({ camera, clock }) => {
    const g = group.current
    if (!g) return
    const w = source.warp
    const cam = camera as PerspectiveCamera
    if (w <= 0.001) {
      if (g.visible) g.visible = false
      if (baseFov.current !== null) {
        cam.fov = baseFov.current
        cam.updateProjectionMatrix()
        baseFov.current = null
      }
      return
    }
    if (source.fovKick !== false) {
      if (baseFov.current === null) baseFov.current = cam.fov
      cam.fov = baseFov.current + FOV_KICK * w
      cam.updateProjectionMatrix()
    }

    g.visible = true
    g.position.copy(cam.position)
    g.quaternion.copy(cam.quaternion)
    const halfH = DEPTH * Math.tan((cam.fov * Math.PI) / 360)
    const halfW = halfH * cam.aspect
    const span = Math.hypot(halfW, halfH)
    const t = clock.elapsedTime
    const arr = res.geo.attributes.position.array as Float32Array
    for (let i = 0; i < N; i++) {
      const [a, r0, ph, sp] = res.seeds[i]
      // 바깥으로 흐른다 — 세기가 셀수록 빠르고 길다
      const s = (ph + t * sp * (0.3 + 1.5 * w)) % 1
      const r = (r0 * 0.35 + s * 0.9) * span
      const len = span * (0.03 + 0.32 * w) * (0.4 + s)
      const c = Math.cos(a)
      const n = Math.sin(a)
      const o = i * 6
      arr[o] = c * r
      arr[o + 1] = n * r
      arr[o + 2] = -DEPTH
      arr[o + 3] = c * (r + len)
      arr[o + 4] = n * (r + len)
      arr[o + 5] = -DEPTH
    }
    res.geo.attributes.position.needsUpdate = true
    res.mat.opacity = 0.7 * Math.min(1, w * 1.2)
    // 섬광: 세기가 많이 찼을 때 은은하게(부드럽게 차오르고 빠진다)
    const f = flash.current
    if (f) {
      const x = Math.min(1, Math.max(0, (w - 0.65) / 0.35))
      res.flashMat.opacity = 0.32 * x * x * (3 - 2 * x)
      f.position.set(0, 0, -2)
      f.scale.set(2 * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect * 1.2, 2 * Math.tan((cam.fov * Math.PI) / 360) * 1.2, 1)
    }
  })

  return (
    <group ref={group} visible={false}>
      <lineSegments geometry={res.geo} material={res.mat} renderOrder={1000} frustumCulled={false} raycast={noRaycast} />
      <mesh ref={flash} geometry={res.flashGeo} material={res.flashMat} renderOrder={1001} frustumCulled={false} raycast={noRaycast} />
    </group>
  )
}
