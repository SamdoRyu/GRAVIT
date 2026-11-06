// 정거장 공용 부품 — 시안 station.js의 부품을 R3F로 다시 만든 것(시안 단위). 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three'
import { noRaycast } from '../../scene/runtime'
import { HULL_Y, type Axis } from './geometry'

export const COLORS = {
  hull: 0xc2b3d8,
  floor: 0xe6dccb,
  skin: 0xe9e0cf,
  trim: 0xf29a52,
  teal: 0x8ff0e0,
  lamp: 0xffd58a,
  cargo: 0xf1e4cc,
  metal: 0x9f93b8,
  frame: 0xd8ccb6,
  band: 0xc9bca4,
  cut: 0xf6c79a,
  cap: 0xe2d8c5,
  armor: 0xd2c8b6,
  armorCap: 0xc8bdaa,
  console: 0xe6dbc6,
  consoleTop: 0xf1e9da,
  screen: 0x2a3a6a,
  screenGlow: 0x7fe0d2,
} as const

const lamCache = new Map<string, MeshLambertMaterial>()
/** 시안의 lam(): 평면 음영 Lambert, 같은 설정은 하나만 만든다 */
export function lam(color: number, extra: { side?: typeof DoubleSide | typeof BackSide; transparent?: boolean; opacity?: number; emissive?: number } = {}): MeshLambertMaterial {
  const key = `${color}|${extra.side ?? ''}|${extra.transparent ?? ''}|${extra.opacity ?? ''}|${extra.emissive ?? ''}`
  let m = lamCache.get(key)
  if (!m) {
    m = new MeshLambertMaterial({ color, flatShading: true, ...extra, ...(extra.emissive !== undefined ? { emissive: new Color(extra.emissive) } : {}), depthWrite: !extra.transparent })
    lamCache.set(key, m)
  }
  return m
}
const basicCache = new Map<number, MeshBasicMaterial>()
export function basic(color: number): MeshBasicMaterial {
  let m = basicCache.get(color)
  if (!m) basicCache.set(color, (m = new MeshBasicMaterial({ color })))
  return m
}

type V3 = [number, number, number]

/** 상자 메쉬 */
export function Bx({ s, p, c, rot }: { s: V3; p: V3; c: MeshLambertMaterial | MeshBasicMaterial; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} material={c} castShadow={!(c instanceof MeshBasicMaterial)} receiveShadow raycast={noRaycast}>
      <boxGeometry args={s} />
    </mesh>
  )
}

// ---- 빛 번짐(시안 glow sprite) ----
let glowTexture: CanvasTexture | null = null
function glowTex(): CanvasTexture {
  if (glowTexture) return glowTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')
  if (x) {
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.22, 'rgba(255,255,255,0.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr
    x.fillRect(0, 0, 128, 128)
  }
  glowTexture = new CanvasTexture(c)
  return glowTexture
}
export function Glow({ color, size, p, opacity = 0.8, fog = true }: { color: number; size: number; p: V3; opacity?: number; fog?: boolean }) {
  const mat = useMemo(() => new SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog }), [color, opacity, fog])
  useEffect(() => () => mat.dispose(), [mat]) // glows on agenda shapes come and go (the shared texture stays)
  return <sprite material={mat} position={p} scale={[size, size, 1]} raycast={noRaycast} />
}

/** 콘솔(책상 + 화면) */
export function Console({ p, ry }: { p: V3; ry: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Bx s={[2.0, 1.0, 0.8]} p={[0, 0.5, 0]} c={lam(COLORS.console)} />
      <Bx s={[2.2, 0.12, 1.1]} p={[0, 1.05, 0.1]} c={lam(COLORS.consoleTop)} />
      <Bx s={[1.8, 0.95, 0.1]} p={[0, 1.7, -0.25]} c={lam(COLORS.screen)} rot={[-0.2, 0, 0]} />
      <mesh position={[0, 1.71, -0.19]} rotation={[-0.2, 0, 0]} material={basic(COLORS.screenGlow)} raycast={noRaycast}>
        <planeGeometry args={[1.6, 0.75]} />
      </mesh>
    </group>
  )
}

/** 선반(시안 rack) */
export function Rack({ p }: { p: V3 }) {
  const m = lam(0xe2d7c1)
  return (
    <group position={p}>
      <Bx s={[0.12, 3.2, 3.6]} p={[-0.55, 1.6, 0]} c={lam(0xd2c4ab)} />
      {[-1.73, 1.73].map((z) => (
        <Bx key={z} s={[0.14, 3.2, 0.14]} p={[0.55, 1.6, z]} c={m} />
      ))}
      {[0.05, 1.1, 2.15, 3.15].map((y) => (
        <Bx key={y} s={[1.2, 0.1, 3.6]} p={[0, y, 0]} c={m} />
      ))}
    </group>
  )
}

/** 분사구 */
export function Thruster({ p, size = 1 }: { p: V3; size?: number }) {
  return (
    <group position={p}>
      <mesh rotation={[Math.PI, 0, 0]} material={lam(COLORS.metal)} raycast={noRaycast}>
        <coneGeometry args={[0.55 * size, 0.8 * size, 12]} />
      </mesh>
      <Glow color={COLORS.teal} size={2.6 * size} p={[0, -0.7 * size, 0]} opacity={0.6} />
    </group>
  )
}

/** 연결 통로: axis 방향으로 from~to, 다른 축 좌표 at, 높이는 모듈 축 */
export function Tube({ axis, from, to, at }: { axis: Axis; from: number; to: number; at: number }) {
  const len = to - from
  const mid = (from + to) / 2
  const p: V3 = axis === 'x' ? [mid, HULL_Y, at] : [at, HULL_Y, mid]
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
  const ribs: number[] = []
  for (let s = 0.8; s < len - 0.4; s += 1.6) ribs.push(s - len / 2)
  return (
    <group position={p}>
      <mesh rotation={rot} material={lam(0xe4d9c5)} castShadow receiveShadow raycast={noRaycast}>
        <cylinderGeometry args={[1, 1, len, 16]} />
      </mesh>
      {ribs.map((o) => (
        <mesh key={o} position={axis === 'x' ? [o, 0, 0] : [0, 0, o]} rotation={axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]} material={lam(0xc9b9a0)} raycast={noRaycast}>
          <torusGeometry args={[1.06, 0.1, 6, 18]} />
        </mesh>
      ))}
    </group>
  )
}

// ---- 컷어웨이 원통 모듈 ----
// 선체 일부가 늘 카메라 쪽으로 열려 있어 어느 각도에서든 안이 보인다(시안 module()).
const camLocal = new Vector3()

export interface ModuleProps {
  x: number
  z: number
  axis: Axis
  length: number
  radius: number
  /** 열린 각도(도) */
  cut?: number
  armor?: boolean
}

export function CutawayModule({ x, z, axis, length, radius, cut = 150, armor = false }: ModuleProps) {
  const root = useRef<Group>(null)
  const shell = useRef<Group>(null)
  const caps = useRef<(Mesh | null)[]>([])
  const beta = useRef<number | null>(null)
  const geo = useMemo(() => {
    const c = (cut * Math.PI) / 180
    const th = 2 * Math.PI - c
    const skin = new CylinderGeometry(radius, radius, length, 40, 1, true, c / 2, th).rotateZ(Math.PI / 2)
    const bandCount = Math.max(2, Math.round(length / (armor ? 2.2 : 3)))
    const band = new CylinderGeometry(radius + 0.14, radius + 0.14, armor ? 0.7 : 0.36, 40, 1, true, c / 2, th).rotateZ(Math.PI / 2)
    const cap = new SphereGeometry(radius, 28, 12, 0, 2 * Math.PI, 0, Math.PI / 2)
    const ring = new TorusGeometry(radius + 0.06, armor ? 0.32 : 0.22, 8, 40).rotateY(Math.PI / 2)
    return { c, skin, band, bandCount, cap, ring }
  }, [length, radius, cut, armor])
  const deckW = 2 * radius * 0.83
  const deckY = -radius * 0.55

  useFrame(({ camera }) => {
    const g = root.current
    const s = shell.current
    if (!g || !s) return
    g.worldToLocal(camLocal.copy(camera.position))
    let b = Math.atan2(camLocal.y, camLocal.z)
    if (b < 0) b = camLocal.z >= 0 ? 0.6 : Math.PI - 0.6
    b = Math.min(Math.max(b, 0.6), Math.PI - 0.6)
    beta.current = beta.current === null ? b : beta.current + (b - beta.current) * 0.2
    s.rotation.x = -beta.current
    const ax = camLocal.x / Math.max(1e-3, camLocal.length())
    caps.current.forEach((m, i) => {
      if (m) m.visible = (i === 0 ? 1 : -1) * ax < 0.55
    })
  })

  return (
    <group ref={root} position={[x, HULL_Y, z]} rotation={[0, axis === 'z' ? Math.PI / 2 : 0, 0]}>
      <group ref={shell}>
        <mesh geometry={geo.skin} material={lam(armor ? COLORS.armor : COLORS.skin)} castShadow receiveShadow raycast={noRaycast} />
        <mesh geometry={geo.skin} material={lam(0xf2e8d6, { side: BackSide })} receiveShadow raycast={noRaycast} />
        {Array.from({ length: geo.bandCount + 1 }, (_, i) => (
          <mesh key={i} geometry={geo.band} position={[-length / 2 + (i * length) / geo.bandCount, 0, 0]} material={lam(COLORS.band, { side: DoubleSide })} castShadow raycast={noRaycast} />
        ))}
        {[geo.c / 2, -geo.c / 2].map((a) => (
          <mesh key={a} position={[0, radius * Math.sin(a), radius * Math.cos(a)]} rotation={[-a, 0, 0]} material={basic(COLORS.cut)} raycast={noRaycast}>
            <boxGeometry args={[length, 0.14, 0.32]} />
          </mesh>
        ))}
      </group>
      {[1, -1].map((side, i) => (
        <group key={side} position={[(side * length) / 2, 0, 0]}>
          <mesh
            ref={(m) => {
              caps.current[i] = m
            }}
            geometry={geo.cap}
            rotation={[0, 0, (-side * Math.PI) / 2]}
            scale={[1, 0.42, 1]}
            material={lam(armor ? COLORS.armorCap : COLORS.cap, { side: DoubleSide })}
            castShadow
            raycast={noRaycast}
          />
          <mesh geometry={geo.ring} material={lam(COLORS.band, { side: DoubleSide })} castShadow raycast={noRaycast} />
          <Glow color={side > 0 ? 0xff8f7a : 0x8ff0e0} size={1.2} p={[side * (radius * 0.42 + 0.1), 0, 0]} opacity={0.9} />
        </group>
      ))}
      <Bx s={[length + 0.3, 0.16, deckW]} p={[0, deckY, 0]} c={lam(COLORS.floor)} />
      <Bx s={[length * 0.75, 0.5, 0.9]} p={[0, -radius - 0.15, 0]} c={lam(COLORS.metal)} />
      <Thruster p={[-length * 0.25, -radius - 0.55, 0]} size={0.8} />
      <Thruster p={[length * 0.25, -radius - 0.55, 0]} size={0.8} />
      <pointLight position={[0, radius * 0.2, 0]} color={0xffd9a0} intensity={0.55 * Math.PI} distance={radius * 4.5} decay={1} />
    </group>
  )
}
