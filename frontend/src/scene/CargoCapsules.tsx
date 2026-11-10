// 새 이슈 화물 캡슐(#304 — 팀 결정 2026-11-09). 보고 있는 중에 새 이슈가 들어오면 하늘에서 캡슐이 도킹 베이 위로 감속하며
// 내려와 뚜껑을 열고, 그 안에서 새 이슈 상자들이 튀어나와 자기 자리로 날아간다(상자는 TaskBox가 움직인다). 다 내보내면 다시 떠난다.
// 캡슐 시간표 · 자리는 cargoFx가 정하고, 여기서는 그리기만 한다. 움직임 줄이기면 상자 쪽이 신청하지 않아 캡슐도 없다.
// 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, SpriteMaterial, type Group, type Mesh, type Sprite } from 'three'
import { COLORS, glowTex, lam } from '../theme/station/parts'
import { WORLD_SCALE } from '../theme/station/geometry'
import { CARGO_LAND, CARGO_T, cargoFx, capsuleEnd } from './cargoFx'
import { installDevCargoDemo } from './devCargoDemo'
import { glowGain } from './bloom'
import { noRaycast } from './runtime'

const S = WORLD_SCALE
/** 동시에 보일 수 있는 캡슐 수(떠나는 캡슐 + 내려오는 캡슐) */
const VIEWS = 3
/** 캡슐 몸통 반지름 · 높이(시안 단위) */
const R = 1.55
const H = 2.1
/** 하늘 어디서 내려와 어디로 떠나는지(시안 단위, 내려앉는 자리 기준) */
const FALL_HEIGHT = 30
const FALL_SIDE = 8
const LID_OPEN = 1.9
const smooth = (u: number) => u * u * (3 - 2 * u)
const clamp01 = (u: number) => Math.min(1, Math.max(0, u))

/** 캡슐 하나 — 몸통 · 띠 · 열리는 뚜껑 · 분사 불꽃 · 열릴 때 번쩍임 */
function CapsuleView({ slot }: { slot: number }) {
  const root = useRef<Group>(null)
  const lid = useRef<Group>(null)
  const flame = useRef<Mesh>(null)
  const flash = useRef<Sprite>(null)
  const inner = useRef<Sprite>(null)
  const mats = useMemo(
    () => ({
      flame: new MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      // 빛 번짐(#305)에는 약하게 — 번쩍임이 하얗게 날아가지 않게
      flash: glowGain(new SpriteMaterial({ map: glowTex(), color: 0xfff4d8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), 0.5),
      inner: glowGain(new SpriteMaterial({ map: glowTex(), color: COLORS.lamp, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), 0.6),
    }),
    [],
  )
  useEffect(
    () => () => {
      mats.flame.dispose()
      mats.flash.dispose()
      mats.inner.dispose()
    },
    [mats],
  )

  useFrame(() => {
    const g = root.current
    if (!g) return
    const now = performance.now()
    const c = cargoFx.capsules[slot]
    if (!c || now < c.start) {
      g.visible = false
      return
    }
    g.visible = true
    const e = (now - c.start) / 1000
    const liftStart = (capsuleEnd(c) - c.start) / 1000 - CARGO_T.lift
    // 캡슐마다 다른 방향에서 와서 다른 방향으로 떠난다
    const ang = c.id * 2.1
    const sx = Math.cos(ang) * FALL_SIDE
    const sz = Math.sin(ang) * FALL_SIDE
    let x = CARGO_LAND.x
    let y = CARGO_LAND.y
    let z = CARGO_LAND.z
    let burn = 0
    let tilt = 0
    if (e < CARGO_T.descend) {
      // 감속하며 내려온다(끝으로 갈수록 역분사가 세다)
      const u = e / CARGO_T.descend
      const k = (1 - u) ** 3
      x += sx * k * S
      y += FALL_HEIGHT * k * S
      z += sz * k * S
      burn = (0.35 + 0.65 * u) * clamp01((1 - u) / 0.12)
      tilt = 0.25 * (1 - u)
    } else if (e < liftStart) {
      // 내려앉은 뒤 살짝 출렁
      const s = e - CARGO_T.descend
      y += 0.12 * S * Math.exp(-5 * s) * Math.sin(s * 14)
    } else {
      // 다시 떠난다(점점 빨라진다)
      const v = clamp01((e - liftStart) / CARGO_T.lift)
      const k = v ** 3
      x -= sz * 0.5 * k * S
      y += FALL_HEIGHT * 1.2 * k * S
      z += sx * 0.5 * k * S
      burn = clamp01(v * 4) * (1 - v * 0.5)
      tilt = -0.2 * v
    }
    g.position.set(x, y, z)
    g.rotation.set(tilt * Math.sin(ang), 0, tilt * Math.cos(ang))

    // 뚜껑: 내려앉으면 열리고, 떠나기 전에 닫힌다
    const open = smooth(clamp01((e - CARGO_T.descend) / CARGO_T.open)) * (1 - smooth(clamp01((e - liftStart + 0.35) / 0.3)))
    if (lid.current) lid.current.rotation.z = open * LID_OPEN
    if (flame.current) {
      flame.current.visible = burn > 0.01
      flame.current.scale.set(1, 0.6 + burn * 1.2 + 0.15 * Math.sin(now * 0.05), 1)
    }
    mats.flame.opacity = burn * 0.75
    // 뚜껑이 열리는 순간 번쩍, 열려 있는 동안 안쪽 불빛
    const f = e - CARGO_T.descend - CARGO_T.open * 0.4
    mats.flash.opacity = f > 0 ? Math.exp(-f * 3) : 0
    if (flash.current) flash.current.scale.setScalar((8 + 10 * clamp01(f * 2)) * (f > 0 ? 1 : 0.0001))
    mats.inner.opacity = open * 0.85
    if (inner.current) inner.current.visible = open > 0.01
  })

  return (
    <group ref={root} visible={false}>
      <group scale={S}>
        {/* 몸통 · 아래 둥근 바닥 · 띠 */}
        <mesh material={lam(COLORS.skin)} raycast={noRaycast}>
          <cylinderGeometry args={[R, R, H, 18, 1]} />
        </mesh>
        <mesh position={[0, -H / 2, 0]} rotation={[Math.PI, 0, 0]} material={lam(COLORS.cap)} raycast={noRaycast}>
          <sphereGeometry args={[R, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {[-0.35, 0.45].map((yy) => (
          <mesh key={yy} position={[0, yy, 0]} material={lam(COLORS.trim)} raycast={noRaycast}>
            <cylinderGeometry args={[R * 1.04, R * 1.04, 0.22, 18, 1]} />
          </mesh>
        ))}
        {/* 착륙 다리 셋 */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * R * 0.85, -H / 2 - 0.55, Math.sin((i * Math.PI * 2) / 3) * R * 0.85]} material={lam(COLORS.metal)} raycast={noRaycast}>
            <cylinderGeometry args={[0.08, 0.14, 0.9, 6]} />
          </mesh>
        ))}
        {/* 뚜껑 — 한쪽 가장자리를 축으로 젖혀 열린다 */}
        <group ref={lid} position={[-R, H / 2, 0]}>
          <mesh position={[R, 0, 0]} material={lam(COLORS.cap, { side: DoubleSide })} raycast={noRaycast}>
            <sphereGeometry args={[R, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[R, R * 0.98, 0]} material={lam(COLORS.trim)} raycast={noRaycast}>
            <cylinderGeometry args={[0.18, 0.18, 0.16, 10]} />
          </mesh>
        </group>
        {/* 역분사 불꽃 */}
        <mesh ref={flame} position={[0, -H / 2 - R - 0.2, 0]} rotation={[Math.PI, 0, 0]} material={mats.flame} visible={false} renderOrder={4} raycast={noRaycast}>
          <coneGeometry args={[0.6, 2.2, 12, 1, true]} />
        </mesh>
        <sprite ref={inner} position={[0, H / 2 + 0.3, 0]} scale={[6, 6, 1]} material={mats.inner} visible={false} raycast={noRaycast} />
        <sprite ref={flash} position={[0, H / 2 + 0.4, 0]} material={mats.flash} raycast={noRaycast} />
      </group>
    </group>
  )
}

export function CargoCapsules() {
  // 개발 모드 전용 리허설 수단(Shift + I · gravitDemo.cargo(n)) — 배포 빌드에는 없다
  useEffect(() => installDevCargoDemo(), [])
  // 다 떠난 캡슐은 목록에서 뺀다(앞에서부터 — 보이는 칸 번호가 목록 순서다)
  useFrame(() => {
    const now = performance.now()
    while (cargoFx.capsules.length && capsuleEnd(cargoFx.capsules[0]) < now) cargoFx.capsules.shift()
  })
  return (
    <>
      {Array.from({ length: VIEWS }, (_, i) => (
        <CapsuleView key={i} slot={i} />
      ))}
    </>
  )
}
