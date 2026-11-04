// 우주정거장 본체 — 확정 시안(public/station)의 모듈 · 통로 · 트러스를 R3F로 다시 만든 것. 소유: C.
// 시안 단위로 그리고 WORLD_SCALE로 줄인다. 데이터 화물(이슈 · PR 등)은 여기 없다 — 장면이 ThemeLayout 자리에 그린다.
import { useMemo } from 'react'
import { DoubleSide, TorusGeometry } from 'three'
import { noRaycast } from '../../scene/runtime'
import { ARCHIVE, BRIDGE, COMM_HUB, DOCK, EXTRA_POD_TUBES, HUB, HULL_Y, LAUNCH_RACK, POD, PODS, SCANNER, TUBES, WORLD_SCALE, type Pod } from './geometry'
import { Bx, COLORS, Console, CutawayModule, Glow, Rack, Thruster, Tube, basic, lam } from './parts'

const PI = Math.PI

function Bridge() {
  const { x, z } = BRIDGE
  const saucer = useMemo(() => new TorusGeometry(7.4, 0.45, 6, 40).rotateX(PI / 2), [])
  const tableRing = useMemo(() => new TorusGeometry(2.95, 0.07, 4, 48).rotateX(PI / 2), [])
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, -0.85, 0]} material={lam(COLORS.hull)} castShadow receiveShadow raycast={noRaycast}>
        <cylinderGeometry args={[7.2, 4.4, 1.9, 32]} />
      </mesh>
      <mesh geometry={saucer} position={[0, -0.1, 0]} material={lam(COLORS.band, { side: DoubleSide })} raycast={noRaycast} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * PI * 2
        return <Glow key={i} color={i % 2 ? 0xff8f7a : COLORS.teal} size={1.0} p={[Math.cos(a) * 7.9, -0.1, Math.sin(a) * 7.9]} opacity={0.85} />
      })}
      <mesh position={[0, 0.15, 0]} material={lam(COLORS.floor)} receiveShadow raycast={noRaycast}>
        <cylinderGeometry args={[7.0, 7.0, 0.1, 32]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={lam(COLORS.skin, { side: DoubleSide })} raycast={noRaycast}>
        <cylinderGeometry args={[7.2, 7.2, 1.0, 32, 1, true]} />
      </mesh>
      <Thruster p={[0, -2.0, 0]} size={1.3} />
      {/* 회의 탁자 */}
      <mesh position={[0, 0.7, 0]} material={lam(0xe6dac3)} castShadow receiveShadow raycast={noRaycast}>
        <cylinderGeometry args={[3.0, 3.3, 1.2, 14]} />
      </mesh>
      <mesh position={[0, 1.34, 0]} material={basic(0x1b3154)} raycast={noRaycast}>
        <cylinderGeometry args={[3.0, 3.0, 0.08, 40]} />
      </mesh>
      <mesh geometry={tableRing} position={[0, 1.39, 0]} material={basic(COLORS.teal)} raycast={noRaycast} />
      <Glow color={COLORS.teal} size={7} p={[0, 1.6, 0]} opacity={0.35} />
      {/* 유리 돔 */}
      <mesh position={[0, 0.1, 0]} material={lam(0xd8f3f7, { transparent: true, opacity: 0.15, side: DoubleSide })} raycast={noRaycast}>
        <sphereGeometry args={[7.2, 32, 12, 0, PI * 2, 0, PI / 2]} />
      </mesh>
      <mesh position={[0, 8.8, 0]} material={lam(COLORS.frame)} raycast={noRaycast}>
        <cylinderGeometry args={[0.1, 0.14, 3.2, 8]} />
      </mesh>
      <Glow color={0xff8f7a} size={1.3} p={[0, 10.5, 0]} opacity={0.9} />
    </group>
  )
}

function PodUnit({ pod }: { pod: Pod }) {
  // 콘솔은 바깥쪽 끝에서 2.1 안쪽, 바깥을 바라본다(시안 consoleAt)
  const cx = pod.axis === 'x' ? pod.x + pod.outward * 2.1 : pod.x
  const cz = pod.axis === 'z' ? pod.z + pod.outward * 2.1 : pod.z
  const ry = pod.axis === 'z' ? (pod.outward < 0 ? 0 : PI) : pod.outward > 0 ? -PI / 2 : PI / 2
  return (
    <>
      <CutawayModule x={pod.x} z={pod.z} axis={pod.axis} length={POD.length} radius={POD.radius} cut={160} />
      <Console p={[cx, POD.deckY, cz]} ry={ry} />
    </>
  )
}

function Hub() {
  const band = useMemo(() => new TorusGeometry(3.0, 0.22, 6, 32).rotateX(PI / 2), [])
  return (
    <group position={[HUB.x, HULL_Y, HUB.z]}>
      <mesh material={lam(COLORS.skin)} castShadow receiveShadow raycast={noRaycast}>
        <icosahedronGeometry args={[HUB.radius, 2]} />
      </mesh>
      <mesh geometry={band} material={lam(COLORS.band, { side: DoubleSide })} raycast={noRaycast} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * PI) / 2 + PI / 4
        return <Glow key={i} color={COLORS.lamp} size={0.9} p={[Math.cos(a) * 2.95, 0.9, Math.sin(a) * 2.95]} opacity={0.9} />
      })}
    </group>
  )
}

function CommHub() {
  const y = COMM_HUB.deckY
  return (
    <>
      <CutawayModule x={COMM_HUB.x} z={COMM_HUB.z} axis="x" length={COMM_HUB.length} radius={COMM_HUB.radius} />
      {/* 게시판 화면 + 선반 */}
      <Bx s={[8.0, 2.3, 0.08]} p={[COMM_HUB.x, y + 1.45, 4.95]} c={basic(0x1d2c55)} />
      {[y + 2.6, y + 0.3].map((yy) => (
        <Bx key={yy} s={[8.0, 0.08, 0.08]} p={[COMM_HUB.x, yy, 5.0]} c={basic(COLORS.teal)} />
      ))}
      <Bx s={[7.6, 0.1, 0.6]} p={[COMM_HUB.x, y + 0.45, COMM_HUB.shelf.z]} c={lam(COLORS.consoleTop)} />
      <Console p={[COMM_HUB.x, y, 9.3]} ry={PI} />
      <mesh position={[39.4, HULL_Y + 5.6, COMM_HUB.z]} rotation={[PI + 0.9, 0.7, 0]} material={lam(0xf3ecdd, { side: DoubleSide })} raycast={noRaycast}>
        <sphereGeometry args={[1.5, 16, 6, 0, PI * 2, 0, 1.0]} />
      </mesh>
      <Glow color={0xff9d4d} size={1.6} p={[39.4, HULL_Y + 5.4, COMM_HUB.z]} opacity={0.9} />
    </>
  )
}

function Dock() {
  const dockRing = useMemo(() => new TorusGeometry(2.4, 0.45, 8, 28), [])
  return (
    <>
      <CutawayModule x={DOCK.x} z={DOCK.z} axis="z" length={DOCK.length} radius={DOCK.radius} />
      <Rack p={[7.0, DOCK.deckY, 29.4]} />
      <Rack p={[7.0, DOCK.deckY, 33.9]} />
      <mesh geometry={dockRing} position={[DOCK.x, HULL_Y, 41.8]} material={lam(0xfff4e2)} raycast={noRaycast} />
      <mesh position={[DOCK.x, HULL_Y, 41.8]} rotation={[PI / 2, 0, 0]} material={lam(0x2a2f63)} raycast={noRaycast}>
        <cylinderGeometry args={[2.0, 2.0, 0.3, 28]} />
      </mesh>
    </>
  )
}

function Archive() {
  return (
    <>
      <CutawayModule x={ARCHIVE.x} z={ARCHIVE.z} axis="z" length={ARCHIVE.length} radius={ARCHIVE.radius} cut={140} armor />
      <Rack p={[45.0, ARCHIVE.deckY, 2.5]} />
      <Rack p={[45.0, ARCHIVE.deckY, 6.6]} />
    </>
  )
}

/** F. 발사 대기 거치대 — 장식 */
function LaunchRack() {
  const { x, z, y } = LAUNCH_RACK
  const ring = useMemo(() => new TorusGeometry(2.2, 0.3, 6, 28).rotateY(PI / 2), [])
  return (
    <>
      <Bx s={[7.0, 0.3, 4.0]} p={[x, y, z]} c={lam(COLORS.frame)} />
      <Bx s={[7.2, 0.25, 0.25]} p={[x, y + 0.35, z - 1.9]} c={lam(COLORS.metal)} />
      <Bx s={[7.2, 0.25, 0.25]} p={[x, y + 0.35, z + 1.9]} c={lam(COLORS.metal)} />
      {[[-1.4, -1.0, 0.5], [-1.4, 1.0, -0.5], [1.4, -1.0, 0.5], [1.4, 1.0, -0.5]].map(([dx, dz, rx]) => (
        <Bx key={`${dx}${dz}`} s={[0.3, 1.3, 0.3]} p={[x + dx, y + 0.75, z + dz]} c={lam(COLORS.trim)} rot={[rx, 0, 0]} />
      ))}
      <mesh geometry={ring} position={[x + 4.2, y + 1.4, z]} material={lam(0xf3ecdd)} raycast={noRaycast} />
      <Thruster p={[x, y - 0.6, z]} size={0.9} />
    </>
  )
}

/** E. 스캐너 터널 — 투명 튜브 */
function Scanner() {
  const { x, z, radius, length } = SCANNER
  const floorY = HULL_Y - radius * 0.62
  const ringSmall = useMemo(() => new TorusGeometry(radius + 0.04, 0.12, 5, 28).rotateY(PI / 2), [radius])
  const ringEnd = useMemo(() => new TorusGeometry(radius + 0.1, 0.4, 6, 28).rotateY(PI / 2), [radius])
  const arch = useMemo(() => new TorusGeometry(2.0, 0.24, 6, 24).rotateY(PI / 2), [])
  const ribs: number[] = []
  for (let o = -7.5; o <= 7.6; o += 2.5) ribs.push(o)
  return (
    <>
      <mesh position={[x, HULL_Y, z]} rotation={[0, 0, PI / 2]} material={lam(0xcff3f7, { transparent: true, opacity: 0.13, side: DoubleSide })} raycast={noRaycast}>
        <cylinderGeometry args={[radius, radius, length, 36, 1, true]} />
      </mesh>
      {ribs.map((o) => (
        <mesh key={o} geometry={ringSmall} position={[x + o, HULL_Y, z]} material={lam(COLORS.band, { side: DoubleSide })} raycast={noRaycast} />
      ))}
      {[-8, 8].map((o) => (
        <mesh key={o} geometry={ringEnd} position={[x + o, HULL_Y, z]} material={lam(0xe2d8c5)} raycast={noRaycast} />
      ))}
      <Bx s={[16, 0.16, 3.8]} p={[x, floorY - 0.12, z]} c={lam(COLORS.floor)} />
      <Bx s={[15.4, 0.2, 1.3]} p={[x, floorY + 0.05, z]} c={lam(0xcfc0a5)} />
      {[42.8, 48.3, 53.6].map((ax) => (
        <group key={ax}>
          <mesh geometry={arch} position={[ax, HULL_Y, z]} material={lam(0xf3ecdd)} raycast={noRaycast} />
          <Glow color={COLORS.teal} size={1.3} p={[ax, HULL_Y + 2.0, z]} opacity={0.9} />
        </group>
      ))}
      <Bx s={[12, 0.5, 0.9]} p={[x, HULL_Y - radius - 0.2, z]} c={lam(COLORS.metal)} />
      <Thruster p={[x - 4, HULL_Y - radius - 0.6, z]} size={0.8} />
      <Thruster p={[x + 4, HULL_Y - radius - 0.6, z]} size={0.8} />
    </>
  )
}

/** 주 트러스 · 태양광 날개 */
function Truss() {
  const TZ = 20
  const TY = 8.6
  const panel = (px: number, pz: number) => (
    <group key={`${px}:${pz}`}>
      <Bx s={[12.4, 0.14, 5.0]} p={[px, TY - 0.12, pz]} c={lam(0xece2cf)} />
      <Bx s={[12, 0.12, 4.6]} p={[px, TY, pz]} c={lam(0x2c4a7c, { emissive: 0x0a1630 })} />
    </group>
  )
  return (
    <>
      {[[TY + 0.7, TZ - 0.6], [TY + 0.7, TZ + 0.6], [TY - 0.6, TZ]].map(([y, z]) => (
        <Bx key={`${y}:${z}`} s={[52, 0.2, 0.2]} p={[29, y, z]} c={lam(COLORS.frame)} />
      ))}
      {[-4.5, 62.5].map((px, i) => (
        <group key={px}>
          <Bx s={[Math.abs(px - (i ? 54 : 4)) + 1, 0.2, 0.2]} p={[(px + (i ? 54 : 4)) / 2, TY, TZ]} c={lam(COLORS.frame)} />
          {panel(px, TZ - 3.2)}
          {panel(px, TZ + 3.2)}
        </group>
      ))}
      {[28, 47, 9.5, 30.5].map((px) => (
        <Bx key={px} s={[0.28, TY - HULL_Y - 2, 0.28]} p={[px, (TY + HULL_Y + 2) / 2, TZ]} c={lam(COLORS.frame)} />
      ))}
    </>
  )
}

/** 정거장 본체. `podsShown` = 그릴 포드 번호(0~3은 늘, 4~7은 앉은 팀원이 있을 때만 — 호출 쪽이 정한다). */
export function StationEnvironment({ podsShown }: { podsShown: ReadonlySet<number> }) {
  return (
    <group scale={WORLD_SCALE}>
      <Bridge />
      <Hub />
      {PODS.map((pod, i) => (podsShown.has(i) ? <PodUnit key={i} pod={pod} /> : null))}
      <CommHub />
      <Dock />
      <Archive />
      <LaunchRack />
      <Scanner />
      {TUBES.map((t) => (
        <Tube key={`${t.axis}${t.from}${t.at}`} {...t} />
      ))}
      {Object.entries(EXTRA_POD_TUBES).map(([i, t]) => (podsShown.has(Number(i)) ? <Tube key={`extra${i}`} {...t} /> : null))}
      <Truss />
    </group>
  )
}
