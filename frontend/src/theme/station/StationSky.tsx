// 정거장 조명 · 우주 배경 — 시안의 "카메라를 따라 도는 스튜디오 조명 + 행성 반사광"과 별 · 행성. 소유: C.
// 행성 · 대기 빛 · 성운 색은 사무실마다 다르다(#277 — 팔레트는 받기만 한다, skyPalette.ts). 바뀌면 약 1초에 걸쳐 섞는다.
// 구름 띠 · 대기 가장자리 빛 · 위성 · 궤도선 · 별 깜빡임 · 별똥별은 SkyDetails(#278).
// 시안은 three r150 레거시 조명이라, 여기 세기는 물리 단위로 맞추려 π를 곱한다(Canvas는 linear · flat).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, MeshBasicMaterial, Object3D, SpriteMaterial, Vector3, type DirectionalLight, type Group, type Mesh } from 'three'
import { noGlow } from '../../scene/bloom'
import { DYN_LAYER, LOW_POWER, noRaycast } from '../../scene/runtime'
import { STATION_BOUNDS, WORLD_SCALE } from './geometry'
import { glowTex } from './parts'
import type { SkyPalette } from './skyPalette'
import { PlanetDetails, StarDetails } from './SkyDetails'

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

/** 줄무늬 행성 — 꼭짓점마다 몇 번째 줄무늬 색(0 ~ 4)인지 함께 돌려준다. 색은 팔레트가 정한다 */
function planetGeometry(radius: number): { geometry: IcosahedronGeometry; bands: Uint8Array } {
  const g = new IcosahedronGeometry(radius, 4)
  const pp = g.attributes.position
  const bands = new Uint8Array(pp.count)
  for (let i = 0; i < pp.count; i += 3) {
    const x = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3
    const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3
    const z = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3
    const band = Math.sin(y * 0.035 + Math.sin(x * 0.018 + z * 0.014) * 1.3)
    const b = Math.min(4, Math.max(0, Math.floor((band * 0.5 + 0.5) * 5)))
    bands[i] = bands[i + 1] = bands[i + 2] = b
  }
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(pp.count * 3), 3))
  return { geometry: g, bands }
}

/** 배경에 칠하는 색들 — 팔레트 하나를 three Color로 */
interface SkyColors {
  planet: Color[]
  halo: Color
  nebula: Color[]
}
const colorsOf = (p: SkyPalette): SkyColors => ({ planet: p.planet.map((c) => new Color(c)), halo: new Color(p.halo), nebula: p.nebula.map((c) => new Color(c)) })
const copyColors = (c: SkyColors): SkyColors => ({ planet: c.planet.map((x) => x.clone()), halo: c.halo.clone(), nebula: c.nebula.map((x) => x.clone()) })
/** 팔레트가 바뀔 때 섞는 시간(초) */
const PALETTE_BLEND_S = 1
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** 성운 자리: [방위(도), 기울기, 불투명도] — 색은 팔레트의 nebula[i] */
const NEBULA: [number, number, number][] = [
  [20, 0.0, 0.45],
  [110, -0.05, 0.32],
  [200, 0.1, 0.36],
  [290, -0.1, 0.24],
  [330, 0.25, 0.25],
  [160, 0.3, 0.2],
]

/** 행성 꼭짓점 색 · 대기 빛 · 성운 재질에 색을 칠한다 */
function paintSky(planet: { geometry: IcosahedronGeometry; bands: Uint8Array }, mats: { halo: MeshBasicMaterial; nebula: SpriteMaterial[] }, c: SkyColors) {
  const attr = planet.geometry.attributes.color as Float32BufferAttribute
  const arr = attr.array as Float32Array
  for (let v = 0; v < planet.bands.length; v++) {
    const col = c.planet[planet.bands[v]]
    arr[v * 3] = col.r
    arr[v * 3 + 1] = col.g
    arr[v * 3 + 2] = col.b
  }
  attr.needsUpdate = true
  mats.halo.color.copy(c.halo)
  mats.nebula.forEach((m, i) => m.color.copy(c.nebula[i]))
}

const right = new Vector3()
const back = new Vector3()
const look = new Vector3()

export function StationSky({ palette }: { palette: SkyPalette }) {
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
    // 큰 별(깜빡임)은 SkyDetails가 그린다
    return { small: starGeometry(1600, 900 * S, rnd), planet: planetGeometry(200 * S) }
  }, [])
  // 팔레트를 따라 색이 바뀌는 재질 — 한 번 만들고 색만 고친다
  const mats = useMemo(
    () => ({
      // 하늘의 더하기 빛은 번지지 않는다(#305 — 행성이 뿌옇게 날아가지 않게)
      halo: noGlow(new MeshBasicMaterial({ transparent: true, opacity: 0.22, side: BackSide, depthWrite: false, fog: false, blending: AdditiveBlending })),
      nebula: NEBULA.map(([, , opacity]) => noGlow(new SpriteMaterial({ map: glowTex(), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }))),
    }),
    [],
  )
  useEffect(
    () => () => {
      mats.halo.dispose()
      mats.nebula.forEach((m) => m.dispose())
    },
    [mats],
  )
  // 지금 칠한 색 · 섞는 중이면 출발 색과 시작 시각
  const paint = useRef<{ now: SkyColors | null; from: SkyColors | null; to: SkyColors | null; t0: number }>({ now: null, from: null, to: null, t0: 0 })

  // 사무실이 바뀌면 새 팔레트로 섞기 시작 — 처음 그릴 때와 움직임 줄이기면 바로
  useEffect(() => {
    const p = paint.current
    p.to = colorsOf(palette)
    if (!p.now || reducedMotion()) {
      p.now = copyColors(p.to)
      p.from = null
      paintSky(geo.planet, mats, p.now)
      return
    }
    p.from = copyColors(p.now)
    p.t0 = performance.now()
  }, [palette, geo, mats])

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
    const p = paint.current
    if (p.from && p.now && p.to) {
      const k = Math.min(1, (performance.now() - p.t0) / 1000 / PALETTE_BLEND_S)
      const e = k * k * (3 - 2 * k)
      const { from, to, now } = p
      now.planet.forEach((c, i) => c.lerpColors(from.planet[i], to.planet[i], e))
      now.halo.lerpColors(from.halo, to.halo, e)
      now.nebula.forEach((c, i) => c.lerpColors(from.nebula[i], to.nebula[i], e))
      paintSky(geo.planet, mats, now)
      if (k >= 1) p.from = null
    }
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
        <StarDetails radius={880 * S} />
        {NEBULA.map(([deg, tilt], i) => {
          const a = (deg * PI) / 180
          const d = new Vector3(Math.sin(a), tilt, Math.cos(a)).normalize().multiplyScalar(800 * S)
          return <sprite key={deg} material={mats.nebula[i]} position={[d.x, d.y, d.z]} scale={[900 * S, 900 * S, 1]} raycast={noRaycast} />
        })}
      </group>

      <group position={[CENTER.x, -236 * S, CENTER.z]}>
        <mesh ref={planet} geometry={geo.planet.geometry} rotation={[0, 0, 0.3]} raycast={noRaycast}>
          <meshLambertMaterial vertexColors flatShading fog={false} />
        </mesh>
        <mesh raycast={noRaycast} material={mats.halo}>
          <sphereGeometry args={[200 * S * 1.045, 64, 40]} />
        </mesh>
        <PlanetDetails radius={200 * S} paint={paint} />
      </group>
    </>
  )
}
