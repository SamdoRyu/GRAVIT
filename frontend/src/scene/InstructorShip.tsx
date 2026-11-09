// 강사 우주선 (#290). "강사에게 요청"한 도움 요청이 강사 답변을 기다리는 동안(rules/help awaitingInstructor — 도움 요청 탭의
// 빨간 점과 같은 값) 강사 라코가 차 같은 우주선을 타고 통신 허브 게시판 위로 날아와 떠 있고, 강사 답변이 다 달리면 다시
// 날아간다. 움직임 줄이기 설정이면 비행 없이 나타나고 사라진다. 장식이다 — 특정 강사를 나타내지 않고(이름 · 사람별 값 없음),
// 누를 수 없다(게시판 클릭은 그대로 도움 요청 목록). 우주선은 시안 팔레트의 기본 도형으로 만들고(새 glTF 없음), 라코는 확정
// 시안 「아바타 모델 (스페이 · 라코 glTF)」의 모델(public/station — 읽기만)을 Sit 동작으로 태운다. OWNER: C.
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, MeshBasicMaterial, type Group, type Mesh, type MeshStandardMaterial, type Texture } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { crewEnvironment } from '../theme/station/crewEnvironment'
import { COMM_HUB, WORLD_SCALE } from '../theme/station/geometry'
import { COLORS, lam } from '../theme/station/parts'
import { useAwaitingInstructor } from '../ui/useAwaitingInstructor'
import { FLIGHT_FROM, instructorShipPose, type InstructorFlight } from './instructorFlight'
import { useLinearTextures } from './linearTextures'
import { noRaycast } from './runtime'
import { useDynamicLayer } from './shared'

/** The design's instructor model (public/station — read only). Same rig as the crew: height 1, feet at the origin, facing +z. */
export const RACO_MODEL_URL = '/station/models/raco_avatar.glb'
// 첫 강사 요청이 올 때 바로 보이게 장면과 함께 받는다(3D 지연 청크 안 — 첫 화면 번들 밖, 승무원과 같다)
useGLTF.preload(RACO_MODEL_URL)

/** 머무는 자리(우주선 가운데, 시안 단위): 게시판 화면(CommBoard SCREEN — 위 끝 deckY + 2.6) 위, "도움 요청" 알약보다 위 */
const HOVER = { x: COMM_HUB.x, y: COMM_HUB.deckY + 7.5, z: 6.2 } as const
/** 우주선 크기 배율과 라코 키(시안 단위 — 승무원은 약 3.1) */
const SHIP_SCALE = 1.25
const RACO_HEIGHT = 3.6
const BOB = { amp: 0.22, period: 3.0 } as const
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** 사진 참고 색 — 흰 차체 · 검은 좌석 · 그릴, 시안 라벤더(hull) 바퀴(추진기), 파란 빛줄, 청록 그릴 빛(시안 teal) */
const SHIP = { body: 0xf3f5f9, dark: 0x1c2234, wheel: COLORS.hull, light: 0xdde3ec, blue: 0x3b8cff, lens: 0xfff6dc } as const
const glow = (color: number) => new MeshBasicMaterial({ color, toneMapped: false })
const BLUE_GLOW = glow(SHIP.blue)
const GRILLE_GLOW = glow(COLORS.teal)
const LENS_GLOW = glow(SHIP.lens)
const FLAME = new MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })

/** 우주선 모양(우주선 좌표: 가운데 = 원점, 앞 = +z, 위 = +y). 모든 도형은 누를 수 없다 */
function ShipBody({ flames }: { flames: React.RefObject<Group | null> }) {
  return (
    <group>
      {/* 흰 둥근 차체 — 눌린 구 */}
      <mesh scale={[1.3, 0.78, 1.05]} material={lam(SHIP.body)} castShadow raycast={noRaycast}>
        <sphereGeometry args={[2, 20, 14]} />
      </mesh>
      {/* 위 캐노피 — 흰 테두리 안의 검은 좌석 구멍(라코가 앉는다) */}
      <mesh position={[0, 1.2, -0.25]} rotation={[Math.PI / 2, 0, 0]} material={lam(SHIP.body)} raycast={noRaycast}>
        <torusGeometry args={[1.25, 0.26, 10, 28]} />
      </mesh>
      <mesh position={[0, 1.05, -0.25]} material={lam(SHIP.dark)} raycast={noRaycast}>
        <cylinderGeometry args={[1.18, 1.0, 0.5, 24]} />
      </mesh>
      {/* 앞면 그릴 — 검은 입 안에 청록 빛줄 */}
      <mesh position={[0, -0.35, 1.9]} rotation={[0.25, 0, 0]} material={lam(SHIP.dark)} raycast={noRaycast}>
        <boxGeometry args={[2.3, 0.42, 0.3]} />
      </mesh>
      <mesh position={[0, -0.33, 2.06]} rotation={[0.25, 0, 0]} material={GRILLE_GLOW} raycast={noRaycast}>
        <boxGeometry args={[2.0, 0.1, 0.05]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          {/* 양옆 바퀴(추진기) — 앞뒤로 누운 라벤더 원통, 파란 빛줄 */}
          <group position={[s * 2.75, -0.25, -0.1]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={lam(SHIP.wheel)} castShadow raycast={noRaycast}>
              <cylinderGeometry args={[0.95, 0.95, 2.6, 18]} />
            </mesh>
            <mesh position={[0, 0, 1.3]} scale={[1, 1, 0.35]} material={lam(SHIP.wheel)} raycast={noRaycast}>
              <sphereGeometry args={[0.95, 16, 10]} />
            </mesh>
            <mesh position={[0, 0, -1.3]} scale={[1, 1, 0.35]} material={lam(SHIP.wheel)} raycast={noRaycast}>
              <sphereGeometry args={[0.95, 16, 10]} />
            </mesh>
            {/* 파란 빛줄 — 추진기 가운데를 두르는 가는 고리 두 줄 */}
            {[-0.45, 0.45].map((z) => (
              <mesh key={z} position={[0, 0, z]} material={BLUE_GLOW} raycast={noRaycast}>
                <torusGeometry args={[0.97, 0.05, 8, 32]} />
              </mesh>
            ))}
          </group>
          {/* 팔각 전조등 — 차체와 추진기 사이, 앞을 본다 */}
          <group position={[s * 1.95, 0.35, 1.25]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={lam(SHIP.light)} raycast={noRaycast}>
              <cylinderGeometry args={[0.6, 0.6, 0.4, 8]} />
            </mesh>
            <mesh position={[0, 0.21, 0]} material={LENS_GLOW} raycast={noRaycast}>
              <cylinderGeometry args={[0.38, 0.38, 0.02, 16]} />
            </mesh>
          </group>
        </group>
      ))}
      {/* 추진 불꽃(아래 · 뒤) — 세기는 비행이 정한다 */}
      <group ref={flames}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 2.75, -1.35, -0.1]} rotation={[Math.PI, 0, 0]} material={FLAME} raycast={noRaycast}>
            <coneGeometry args={[0.55, 1.4, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 캐노피에 앉은 라코 — 시안 glTF를 복제해 Sit 동작(없으면 Idle) */
function RacoRider() {
  const gltf = useGLTF(RACO_MODEL_URL)
  const gl = useThree((s) => s.gl)
  const model = useMemo(() => {
    const env = crewEnvironment(gl)
    const root = cloneSkinned(gltf.scene) as Group
    const textures: (Texture | null)[] = []
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false // a skinned mesh moving away from its bind pose must not be culled
      mesh.raycast = noRaycast
      const mat = (mesh.material as MeshStandardMaterial).clone()
      mat.envMap = env
      mat.envMapIntensity = 0.7
      textures.push(mat.map)
      mesh.material = mat
    })
    return { root, textures }
  }, [gltf, gl])
  useLinearTextures(model.textures)
  useEffect(
    () => () =>
      model.root.traverse((o) => {
        const mesh = o as Mesh
        if (mesh.isMesh) (mesh.material as MeshStandardMaterial).dispose()
      }),
    [model],
  )
  const body = useRef<Group>(null)
  const { actions } = useAnimations(gltf.animations, body)
  useEffect(() => {
    ;(actions.Sit ?? actions.Idle)?.reset().play()
  }, [actions])
  return (
    <group ref={body} position={[0, 0.55, -0.35]} scale={RACO_HEIGHT}>
      <primitive object={model.root} />
    </group>
  )
}

/** away = 없음, here = 게시판 위에 떠 있음 */
type Phase = 'away' | InstructorFlight | 'here'

export function InstructorShip() {
  const waiting = useAwaitingInstructor().size > 0
  const [phase, setPhase] = useState<Phase>('away')
  // 기다리는 글이 생기면 오고, 다 답하면 간다(렌더 중에 맞춘다 — 값이 바뀐 그 렌더에서 한 번). 비행 중에 바뀌면 처음부터 반대로
  const [seen, setSeen] = useState(false)
  if (waiting !== seen) {
    setSeen(waiting)
    const still = reducedMotion()
    if (waiting && (phase === 'away' || phase === 'depart')) setPhase(still ? 'here' : 'arrive')
    else if (!waiting && (phase === 'here' || phase === 'arrive')) setPhase(still ? 'away' : 'depart')
  }
  /** 지금 비행의 경과 시간 — 비행 종류가 바뀌면 0부터 */
  const flight = useRef<{ phase: Phase; t: number }>({ phase: 'away', t: 0 })

  const root = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const flames = useRef<Group>(null)
  useDynamicLayer(root)

  useFrame((state, delta) => {
    const g = root.current
    if (!g) return
    const f = flight.current
    if (f.phase !== phase) {
      f.phase = phase
      f.t = 0
    }
    const flying = phase === 'arrive' || phase === 'depart'
    const pose = flying ? instructorShipPose(phase, (f.t += Math.min(delta, 0.1))) : null
    const bob = Math.sin((state.clock.elapsedTime / BOB.period) * Math.PI * 2) * BOB.amp
    g.position.set(HOVER.x + (pose?.dx ?? 0), HOVER.y + (pose?.dy ?? 0) + bob, HOVER.z + (pose?.dz ?? 0))
    if (tilt.current) tilt.current.rotation.z = pose?.bank ?? 0
    const fl = flames.current
    if (fl) {
      const s = 0.35 + (pose?.thrust ?? 0) * 0.9
      fl.scale.set(1, s, 1)
    }
    if (pose?.done) setPhase(phase === 'arrive' ? 'here' : 'away')
  })

  if (phase === 'away') return null
  return (
    <group scale={WORLD_SCALE} name="instructor-ship">
      {/* 첫 프레임 전 자리 — 도착이면 출발점(화면 밖)에서 시작한다 */}
      <group ref={root} position={phase === 'arrive' ? [HOVER.x + FLIGHT_FROM.x, HOVER.y + FLIGHT_FROM.y, HOVER.z + FLIGHT_FROM.z] : [HOVER.x, HOVER.y, HOVER.z]}>
        <group ref={tilt} scale={SHIP_SCALE}>
          <ShipBody flames={flames} />
          <RacoRider />
        </group>
      </group>
    </group>
  )
}
