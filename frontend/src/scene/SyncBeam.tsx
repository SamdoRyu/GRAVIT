// 동기화 수신 빔 (#303 — 팀 결정 2026-11-09). "GitHub를 읽어 온다"를 장면으로: 통신 허브 접시 위 하늘에 작은 GitHub 위성이 떠 있고,
// 동기화가 도는 동안(snapshot.sync.state === 'running') 위성에서 접시로 빛 줄기가 내려오며 데이터 점들이 흘러 들어온다.
// 끝나면(성공 · 실패 모두) 서서히 사라진다 — 실패 표시는 상단 바가 한다. 동기화 상태는 읽기만 한다. 움직임 줄이기면 빛 줄기만 고정.
// 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, PointsMaterial, Quaternion, ShaderMaterial, Vector3, type Group, type Mesh } from 'three'
import { useOffice } from '../store'
import { COLORS, glowTex, lam } from '../theme/station/parts'
import { COMM_HUB, HULL_Y, WORLD_SCALE } from '../theme/station/geometry'
import { glowGain } from './bloom'
import { noRaycast } from './runtime'

const S = WORLD_SCALE
/** 통신 허브 접시(StationEnvironment CommHub)와 그 위 하늘의 위성 자리(시안 단위) */
const DISH = new Vector3(39.4, HULL_Y + 5.6, COMM_HUB.z)
const SAT = new Vector3(DISH.x - 5, DISH.y + 13, DISH.z - 7)
/** 흘러내리는 데이터 점 수 · 빛 줄기 굵기(시안 단위) */
const DOTS = 40
const BEAM_R = 0.55
/** 동기화가 금방 끝나도(시연 사무실 · 변경이 적을 때) 연출이 읽히도록 최소로 켜 두는 시간(ms) */
const MIN_ON_MS = 2500
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(0x9fd6ff) }, k: { value: 0 }, t: { value: 0 }, opacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float k; uniform float t; uniform float opacity;
      varying vec2 vUv;
      void main() {
        // 아래(접시)로 흐르는 띠 — 원통 양면을 더해 그려 가운데가 진하게 보인다
        float flow = 0.55 + 0.45 * sin(vUv.y * 40.0 + t * 9.0);
        float a = k * flow * 0.32 * opacity;
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

/** 위성 모양 — 몸통 · 태양전지판 두 장 · 접시 쪽을 보는 안테나(시안 단위, 원점 = 위성 가운데) */
function Satellite() {
  return (
    <>
      <mesh material={lam(COLORS.skin)} raycast={noRaycast}>
        <boxGeometry args={[1.4, 1.4, 1.8]} />
      </mesh>
      <mesh position={[0, 0, 0.95]} material={lam(COLORS.trim)} raycast={noRaycast}>
        <boxGeometry args={[1.45, 0.25, 0.12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 2.4, 0, 0]} material={lam(0x2c4a7c, { emissive: 0x0a1630 })} raycast={noRaycast}>
          <boxGeometry args={[3, 0.08, 1.3]} />
        </mesh>
      ))}
      <mesh position={[0, -1.0, 0]} rotation={[Math.PI, 0, 0]} material={lam(0xf3ecdd)} raycast={noRaycast}>
        <coneGeometry args={[0.6, 0.6, 12, 1, true]} />
      </mesh>
    </>
  )
}

export function SyncBeam() {
  const running = useOffice((s) => s.office?.snapshot?.sync.state === 'running')
  const sat = useRef<Group>(null)
  const beam = useRef<Mesh>(null)
  const k = useRef(0)
  // 동기화가 시작된 뒤 최소한 이때까지는 켜 둔다
  const holdUntil = useRef(0)
  const wasRunning = useRef(false)
  const still = useMemo(() => reducedMotion(), [])
  const res = useMemo(() => {
    const dir = new Vector3().subVectors(DISH, SAT)
    const len = dir.length()
    const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(DOTS * 3), 3))
    return {
      len,
      quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
      mid: new Vector3().addVectors(DISH, SAT).multiplyScalar(0.5),
      // 빛 번짐(#305)에는 약하게 — 그대로 번지면 하얀 번개처럼 보인다
      mat: glowGain(beamMaterial(), 0.4),
      dotGeo: geo,
      dotMat: glowGain(new PointsMaterial({ map: glowTex(), color: 0xd8f0ff, size: 1.6, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }), 0.4),
      phase: Array.from({ length: DOTS }, (_, i) => (i / DOTS + Math.sin(i * 7.31) * 0.01 + 1) % 1),
    }
  }, [])
  useEffect(
    () => () => {
      res.mat.dispose()
      res.dotGeo.dispose()
      res.dotMat.dispose()
    },
    [res],
  )

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now()
    if (running && !wasRunning.current) holdUntil.current = now + MIN_ON_MS
    wasRunning.current = running
    const goal = running || now < holdUntil.current ? 1 : 0
    k.current += (goal - k.current) * (1 - Math.exp(-3 * dt))
    if (Math.abs(goal - k.current) < 0.002) k.current = goal
    const kk = k.current
    const t = clock.elapsedTime
    // 위성은 늘 천천히 흔들리며 떠 있다
    if (sat.current && !still) {
      sat.current.position.set(SAT.x * S, (SAT.y + Math.sin(t * 0.6) * 0.3) * S, SAT.z * S)
      sat.current.rotation.y = Math.sin(t * 0.25) * 0.3
    }
    const b = beam.current
    if (b) b.visible = kk > 0.005
    res.mat.uniforms.k.value = kk
    res.mat.uniforms.t.value = still ? 0 : t
    // 데이터 점: 위성 → 접시로 흐른다
    res.dotMat.opacity = still ? 0 : kk * 0.9
    if (kk > 0.005 && !still) {
      const arr = res.dotGeo.attributes.position.array as Float32Array
      for (let i = 0; i < DOTS; i++) {
        const u = (res.phase[i] + t * 0.45) % 1
        const x = SAT.x + (DISH.x - SAT.x) * u
        const y = SAT.y + (DISH.y - SAT.y) * u
        const z = SAT.z + (DISH.z - SAT.z) * u
        const wob = Math.sin(i * 12.9 + t * 3) * 0.2
        arr[i * 3] = (x + wob) * S
        arr[i * 3 + 1] = y * S
        arr[i * 3 + 2] = (z - wob) * S
      }
      res.dotGeo.attributes.position.needsUpdate = true
    }
  })

  return (
    <>
      <group ref={sat} position={[SAT.x * S, SAT.y * S, SAT.z * S]} scale={S}>
        <Satellite />
      </group>
      <mesh ref={beam} position={[res.mid.x * S, res.mid.y * S, res.mid.z * S]} quaternion={res.quat} material={res.mat} visible={false} renderOrder={3} raycast={noRaycast}>
        <cylinderGeometry args={[BEAM_R * 0.45 * S, BEAM_R * S, res.len * S, 16, 1, true]} />
      </mesh>
      <points geometry={res.dotGeo} material={res.dotMat} frustumCulled={false} renderOrder={4} raycast={noRaycast} />
    </>
  )
}
