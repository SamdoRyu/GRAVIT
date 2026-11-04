// 정거장 조명 · 우주 배경 — 시안의 "카메라를 따라 도는 스튜디오 조명 + 행성 반사광"과 별 · 행성. 소유: C.
// 시안은 three r150 레거시 조명이라, 여기 세기는 물리 단위로 맞추려 π를 곱한다(Canvas는 linear · flat).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Object3D, Vector3, type DirectionalLight, type Group, type Mesh } from 'three'
import { DYN_LAYER, LOW_POWER, noRaycast } from '../../scene/runtime'
import { STATION_BOUNDS, WORLD_SCALE } from './geometry'
import { Glow } from './parts'

const PI = Math.PI
const S = WORLD_SCALE
const SPACE = '#1a1e50'
const CENTER = new Vector3(((STATION_BOUNDS.minX + STATION_BOUNDS.maxX) / 2) * S, 0, ((STATION_BOUNDS.minZ + STATION_BOUNDS.maxZ) / 2) * S)

/** 정해진 씨앗의 난수 — 별 배치가 새로고침마다 같다 */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function starGeometry(count: number, radius: number, rnd: () => number): BufferGeometry {
  const p: number[] = []
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1
    const th = rnd() * PI * 2
    const r = Math.sqrt(1 - u * u)
    p.push(r * Math.cos(th) * radius, u * radius, r * Math.sin(th) * radius)
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(p, 3))
}

function planetGeometry(radius: number): IcosahedronGeometry {
  const g = new IcosahedronGeometry(radius, 4)
  const pp = g.attributes.position
  const pal = [0xffe3cf, 0xf6b9b0, 0xe7a3c0, 0xc4a2dc, 0x9f8ad0].map((c) => new Color(c))
  const cols: number[] = []
  for (let i = 0; i < pp.count; i += 3) {
    const x = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3
    const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3
    const z = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3
    const band = Math.sin(y * 0.035 + Math.sin(x * 0.018 + z * 0.014) * 1.3)
    const c = pal[Math.min(pal.length - 1, Math.max(0, Math.floor((band * 0.5 + 0.5) * pal.length)))]
    for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b)
  }
  return g.setAttribute('color', new Float32BufferAttribute(cols, 3)) as IcosahedronGeometry
}

const NEBULA: [number, number, number, number][] = [
  [0x6a55b0, 20, 0.0, 0.45],
  [0x2f8f96, 110, -0.05, 0.32],
  [0x8d5aa8, 200, 0.1, 0.36],
  [0xc36f9a, 290, -0.1, 0.24],
  [0x5a6fd0, 330, 0.25, 0.25],
  [0x2f8f96, 160, 0.3, 0.2],
]

const right = new Vector3()
const back = new Vector3()
const look = new Vector3()

export function StationSky() {
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)
  const setDpr = useThree((s) => s.setDpr)
  const stars = useRef<Group>(null)
  const planet = useRef<Mesh>(null)
  const key = useRef<DirectionalLight>(null)
  const rimA = useRef<DirectionalLight>(null)
  const rimB = useRef<DirectionalLight>(null)
  const bounce = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const geo = useMemo(() => {
    const rnd = seeded(7)
    return { small: starGeometry(1600, 900 * S, rnd), big: starGeometry(160, 880 * S, rnd), planet: planetGeometry(200 * S) }
  }, [])

  // 움직이는 것(상자 · 아바타)은 DYN_LAYER에 있다 — 카메라 · 그림자 · 포인터가 그 층도 보게 한다.
  useEffect(() => {
    camera.layers.enable(DYN_LAYER)
    raycaster.layers.enable(DYN_LAYER)
  }, [camera, raycaster])
  useEffect(() => {
    if (LOW_POWER) setDpr(Math.min(window.devicePixelRatio || 1, 1.5))
  }, [setDpr])

  useFrame(({ controls, clock }) => {
    const orbitTarget = (controls as { target?: Vector3 } | null)?.target ?? CENTER
    look.copy(camera.position).sub(orbitTarget)
    const az = Math.atan2(look.x, look.z)
    right.set(Math.cos(az), 0, -Math.sin(az))
    back.set(Math.sin(az), 0, Math.cos(az))
    target.position.copy(orbitTarget)
    key.current?.position.copy(orbitTarget).addScaledVector(right, -50 * S).addScaledVector(back, 38 * S).setY(orbitTarget.y + 80 * S)
    rimA.current?.position.copy(orbitTarget).addScaledVector(back, -60 * S).addScaledVector(right, 34 * S).setY(orbitTarget.y + 26 * S)
    rimB.current?.position.copy(orbitTarget).addScaledVector(back, -60 * S).addScaledVector(right, -40 * S).setY(orbitTarget.y + 8 * S)
    bounce.current?.position.copy(orbitTarget).addScaledVector(back, 12 * S).setY(orbitTarget.y - 60 * S)
    stars.current?.position.copy(camera.position)
    if (planet.current) planet.current.rotation.y = clock.elapsedTime * 0.006
  })

  const shadowR = 56 * S
  return (
    <>
      <color attach="background" args={[SPACE]} />
      <fog attach="fog" args={[SPACE, 100 * S, 340 * S]} />
      <primitive object={target} />
      <hemisphereLight args={[0xcfd8ff, 0x8f7cc6, 0.55 * PI]} />
      <directionalLight
        ref={(l) => {
          key.current = l
          l?.shadow.camera.layers.enable(DYN_LAYER)
        }}
        target={target}
        color={0xfff0dc}
        intensity={0.95 * PI}
        castShadow
        shadow-mapSize={LOW_POWER ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={1}
        shadow-camera-far={280 * S}
        shadow-bias={-0.0006}
      />
      <directionalLight ref={rimA} target={target} color={0x9fe8ff} intensity={0.6 * PI} />
      <directionalLight ref={rimB} target={target} color={0xc9a8ff} intensity={0.45 * PI} />
      <directionalLight ref={bounce} target={target} color={0xf6a9c0} intensity={0.45 * PI} />

      <group ref={stars}>
        <points geometry={geo.small} raycast={noRaycast}>
          <pointsMaterial color={0xffffff} size={1.6} sizeAttenuation={false} transparent opacity={0.85} fog={false} depthWrite={false} />
        </points>
        <points geometry={geo.big} raycast={noRaycast}>
          <pointsMaterial color={0xfff1de} size={3} sizeAttenuation={false} transparent opacity={0.9} fog={false} depthWrite={false} />
        </points>
        {NEBULA.map(([color, deg, tilt, opacity]) => {
          const a = (deg * PI) / 180
          const d = new Vector3(Math.sin(a), tilt, Math.cos(a)).normalize().multiplyScalar(800 * S)
          return <Glow key={deg} color={color} size={900 * S} p={[d.x, d.y, d.z]} opacity={opacity} fog={false} />
        })}
      </group>

      <group position={[CENTER.x, -236 * S, CENTER.z]}>
        <mesh ref={planet} geometry={geo.planet} rotation={[0, 0, 0.3]} raycast={noRaycast}>
          <meshLambertMaterial vertexColors flatShading fog={false} />
        </mesh>
        <mesh raycast={noRaycast}>
          <sphereGeometry args={[200 * S * 1.045, 64, 40]} />
          <meshBasicMaterial color={0xf7c1d9} transparent opacity={0.22} side={BackSide} depthWrite={false} fog={false} blending={AdditiveBlending} />
        </mesh>
      </group>
    </>
  )
}
