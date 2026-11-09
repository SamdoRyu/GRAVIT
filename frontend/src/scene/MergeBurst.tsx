// PR 머지 축하 (#300 — 팀 결정 2026-11-09). 보고 있는 중에 동기화로 PR 머지가 들어와 그 상자가 스캐너 → 아카이브로 날아갈 때,
// 날아가는 동안 빛 꼬리를 남기고 아카이브에 닿는 순간 사무실 팔레트 색 반짝이가 터진다. 사람이 아니라 PR 단위 연출이다.
// 상자(TaskBox)는 축하할 때를 알려 주기만 하고(mergeFx), 입자는 여기 하나가 모아서 그린다. 움직임 줄이기면 상자 쪽이 알리지 않는다.
// 아카이브는 모듈 안쪽 선반이라 반짝이가 벽에 가리지 않게 깊이 검사 없이 그린다(짧은 순간이라 겹쳐 보여도 된다).
// 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, PointsMaterial } from 'three'
import { glowTex } from '../theme/station/parts'
import { installDevMergeDemo } from './devMergeDemo'
import { mergeFx } from './mergeFx'
import { boxLive, noRaycast } from './runtime'
import { useSkyPalette } from './useSkyPalette'

/** 입자 수(꼬리 + 반짝이 합) */
const N = 900
/** 반짝이 하나의 입자 수 */
const BURST = 170
/** 꼬리 입자의 밝기(반짝이 대비) */
const TRAIL_GLOW = 0.35
const trailColor = new Color()

export function MergeBurst() {
  const palette = useSkyPalette()
  const colors = useMemo(() => [palette.halo, palette.planet[2], palette.swatch, 0xfff4d8, 0x8ff0e0].map((c) => new Color(c)), [palette])
  const res = useMemo(() => {
    const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(N * 3), 3)).setAttribute('color', new Float32BufferAttribute(new Float32Array(N * 3), 3))
    // 속성은 넘긴 배열을 복사해 쓰므로, 고칠 때는 속성 자신의 배열에 쓴다
    const pos = geo.attributes.position.array as Float32Array
    const col = geo.attributes.color.array as Float32Array
    const mat = new PointsMaterial({ size: 2.2, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, fog: false })
    // 입자마다 속도 · 남은 수명 · 처음 수명 · 바탕색
    return { geo, mat, pos, col, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), base: new Float32Array(N * 3), next: 0 }
  }, [])
  useEffect(
    () => () => {
      res.geo.dispose()
      res.mat.dispose()
    },
    [res],
  )

  // 개발 모드 전용 리허설 수단(Shift + P · gravitDemo.merge()) — 배포 빌드에는 없다
  useEffect(() => installDevMergeDemo(), [])

  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: Color) => {
    const i = res.next
    res.next = (res.next + 1) % N
    res.pos.set([x, y, z], i * 3)
    res.vel.set([vx, vy, vz], i * 3)
    res.life[i] = res.max[i] = life
    res.base.set([c.r, c.g, c.b], i * 3)
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now()
    // 날아가는 상자 뒤로 빛 꼬리
    for (const key of mergeFx.trails) {
      const b = boxLive.get(key)
      if (!b) continue
      for (let j = 0; j < 2; j++) {
        const c = trailColor.copy(colors[(Math.random() * colors.length) | 0]).multiplyScalar(TRAIL_GLOW)
        emit(b.x + (Math.random() - 0.5) * 0.12, b.y + 0.15 + (Math.random() - 0.5) * 0.12, b.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, c)
      }
    }
    // 터질 시각이 된 반짝이
    while (mergeFx.bursts.length && mergeFx.bursts[0].at <= now) {
      const p = mergeFx.bursts.shift()!
      for (let j = 0; j < BURST; j++) {
        const u = Math.random() * 2 - 1
        const th = Math.random() * Math.PI * 2
        const r = Math.sqrt(1 - u * u)
        const sp = 1.8 + Math.random() * 3.2
        const c = colors[(Math.random() * colors.length) | 0]
        emit(p.x, p.y + 0.45, p.z, r * Math.cos(th) * sp, Math.abs(u) * sp * 0.9 + 0.6, r * Math.sin(th) * sp, 1.2 + Math.random() * 1.0, c)
      }
    }
    // 움직이고 옅어진다(더하기 빛이라 색을 줄이면 사라진다)
    const drag = Math.exp(-1.6 * dt)
    for (let i = 0; i < N; i++) {
      if (res.life[i] <= 0) continue
      res.life[i] -= dt
      const o = i * 3
      if (res.life[i] <= 0) {
        res.col[o] = res.col[o + 1] = res.col[o + 2] = 0
        continue
      }
      res.vel[o] *= drag
      res.vel[o + 1] = res.vel[o + 1] * drag - 0.9 * dt
      res.vel[o + 2] *= drag
      res.pos[o] += res.vel[o] * dt
      res.pos[o + 1] += res.vel[o + 1] * dt
      res.pos[o + 2] += res.vel[o + 2] * dt
      const k = res.life[i] / res.max[i]
      const f = 1.6 * k * k * (1.6 - 0.6 * k)
      res.col[o] = res.base[o] * f
      res.col[o + 1] = res.base[o + 1] * f
      res.col[o + 2] = res.base[o + 2] * f
    }
    res.geo.attributes.position.needsUpdate = true
    res.geo.attributes.color.needsUpdate = true
  })

  return <points geometry={res.geo} material={res.mat} frustumCulled={false} renderOrder={5} raycast={noRaycast} />
}
