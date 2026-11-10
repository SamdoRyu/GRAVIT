// 정거장 배경 디테일 (#278 — 팀 결정 2026-11-09). 행성 쪽: 구름 띠 · 대기 가장자리 빛 · 작은 위성 · 정거장 궤도선.
// 별 쪽: 깜빡이는 큰 별 · 가끔 지나가는 별똥별. 색은 StationSky가 섞고 있는 지금 팔레트 색(사무실별 — #277)을 매 프레임 따라간다.
// 움직임 줄이기면 깜빡임 · 별똥별은 없고 구름 · 위성은 멈춘다. 그리기 호출은 모두 합쳐 몇 개뿐이다. 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineLoop,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointsMaterial,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { noGlow } from '../../scene/bloom'
import { noRaycast } from '../../scene/runtime'

/** StationSky가 지금 칠하고 있는 색(섞는 중이면 중간 색) */
export interface SkyPaint {
  now: { planet: Color[]; halo: Color } | null
}

const PI = Math.PI
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ---------------------------------------------------------------- 행성 쪽

/** 구름 띠 — 행성보다 살짝 큰 껍질에서 줄무늬 모양으로 일부 면만 남긴다 */
function cloudGeometry(radius: number): BufferGeometry {
  const src = new IcosahedronGeometry(radius, 3)
  const pp = src.attributes.position
  const out: number[] = []
  for (let i = 0; i < pp.count; i += 3) {
    const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3 / radius
    const x = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3 / radius
    const z = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3 / radius
    // 위도를 따라 도는 띠 두세 줄 + 경도 방향으로 끊김
    const band = Math.sin(y * 7.5 + Math.sin(x * 3.1 + z * 2.3) * 1.6)
    if (band > 0.55) for (let j = 0; j < 3; j++) out.push(pp.getX(i + j), pp.getY(i + j), pp.getZ(i + j))
  }
  src.dispose()
  const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(out, 3))
  g.computeVertexNormals()
  return g
}

/** 가장자리일수록 밝은 대기 빛(프레넬) — 행성을 덮는 앞면 구에 쓴다 */
function rimMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color() }, strength: { value: 0.5 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 4.5);
        gl_FragColor = vec4(color * rim * strength, rim);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/**
 * 정거장 궤도선 — 행성 중심을 지나는 원을 정거장 너머로 기울였다. 기본 카메라(남동쪽 위)에서 정거장 뒤 하늘에 호를 그리며
 * 양옆 지평선으로 내려간다(정거장을 가로지르지 않고, 정거장 앞을 지나지 않는다). U = 꼭대기(위 · 정거장 너머), V = 화면 가로.
 */
const ORBIT_TILT = 0.5
const ORBIT_U = new Vector3(-0.707 * Math.sin(ORBIT_TILT), Math.cos(ORBIT_TILT), -0.707 * Math.sin(ORBIT_TILT)).normalize()
const ORBIT_V = new Vector3(0.707, 0, -0.707)
function orbitLine(radius: number, material: LineBasicMaterial): LineLoop {
  const pts: number[] = []
  const n = 256
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const p = ORBIT_U.clone().multiplyScalar(Math.cos(a) * radius).addScaledVector(ORBIT_V, Math.sin(a) * radius)
    pts.push(p.x, p.y, p.z)
  }
  const line = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3)), material)
  line.raycast = noRaycast
  return line
}

/** 행성 쪽 디테일 — StationSky의 행성 그룹(행성 중심) 안에 둔다 */
/**
 * 위성의 궤도(행성 중심 기준): 기본 카메라(남동쪽 위, CameraRig)에서 볼 때 정거장 너머 왼쪽 위 하늘을 지나는 원.
 * U = 각도 0의 자리(정거장 너머 왼쪽 위), V = 화면 가로(오른쪽)에 가까운 방향. 천천히 오른쪽으로 넘어가 행성 뒤로 숨었다 돌아온다.
 */
const MOON_U = new Vector3(-0.57, 0.766, -0.297).normalize()
const MOON_V = new Vector3(0.609, 0.151, -0.779).normalize()
const MOON_ORBIT = 1.36
const MOON_START = -0.12
const MOON_SPEED = 0.006

export function PlanetDetails({ radius, paint }: { radius: number; paint: RefObject<SkyPaint> }) {
  const clouds = useRef<Mesh>(null)
  const moon = useRef<Mesh>(null)
  const res = useMemo(() => {
    const orbitMat = new LineBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, fog: false })
    return {
      cloudGeo: cloudGeometry(radius * 1.018),
      cloudMat: new MeshLambertMaterial({ transparent: true, opacity: 0.34, flatShading: true, depthWrite: false, fog: false }),
      rimGeo: new IcosahedronGeometry(radius * 1.004, 5),
      rimMat: rimMaterial(),
      moonGeo: new IcosahedronGeometry(radius * 0.024, 1),
      moonMat: new MeshLambertMaterial({ color: 0xe8ddf0, flatShading: true, fog: false }),
      orbitMat,
      orbit: orbitLine(radius * 1.18, orbitMat),
    }
  }, [radius])
  useEffect(
    () => () => {
      res.cloudGeo.dispose()
      res.cloudMat.dispose()
      res.rimGeo.dispose()
      res.rimMat.dispose()
      res.moonGeo.dispose()
      res.moonMat.dispose()
      res.orbitMat.dispose()
      res.orbit.geometry.dispose()
    },
    [res],
  )
  const still = useMemo(() => reducedMotion(), [])

  useFrame(({ clock }) => {
    const c = paint.current?.now
    if (c) {
      res.cloudMat.color.copy(c.planet[0])
      ;(res.rimMat.uniforms.color.value as Color).copy(c.halo)
      res.orbitMat.color.copy(c.halo)
    }
    const t = still ? 0 : clock.elapsedTime
    const m = moon.current
    if (m) {
      const a = MOON_START + t * MOON_SPEED
      m.position.copy(MOON_U).multiplyScalar(Math.cos(a) * radius * MOON_ORBIT).addScaledVector(MOON_V, Math.sin(a) * radius * MOON_ORBIT)
    }
    if (still) return
    // 구름은 행성(0.006)보다 조금 빠르게 돈다
    if (clouds.current) clouds.current.rotation.y = t * 0.011
  })

  return (
    <>
      <mesh ref={clouds} geometry={res.cloudGeo} material={res.cloudMat} rotation={[0, 0, 0.3]} raycast={noRaycast} />
      <mesh geometry={res.rimGeo} material={res.rimMat} raycast={noRaycast} />
      {/* 위성: 정거장 너머 하늘에서 천천히 돈다 */}
      <mesh ref={moon} geometry={res.moonGeo} material={res.moonMat} raycast={noRaycast} />
      {/* 궤도선: 정거장 너머 하늘의 호 */}
      <primitive object={res.orbit} />
    </>
  )
}

// ---------------------------------------------------------------- 별 쪽

function starPoints(count: number, radius: number, rnd: () => number): BufferGeometry {
  const p: number[] = []
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1
    const th = rnd() * PI * 2
    const r = Math.sqrt(1 - u * u)
    p.push(r * Math.cos(th) * radius, u * radius, r * Math.sin(th) * radius)
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(p, 3))
}

/** 별똥별 꼬리 — 한쪽으로 옅어지는 가는 띠 */
function streakTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 8
  const x = c.getContext('2d')
  if (x) {
    const g = x.createLinearGradient(0, 0, 256, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.85, 'rgba(255,248,236,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
    x.fillStyle = g
    x.fillRect(0, 2, 256, 4)
  }
  return new CanvasTexture(c)
}

/** 깜빡이는 큰 별 묶음 수 · 별똥별 간격(초) */
const TWINKLE_SETS = 3
const SHOOT_EVERY: [number, number] = [6, 13]
const SHOOT_S = 0.9

/** 별 쪽 디테일 — StationSky의 별 그룹(카메라를 따라다님) 안에 둔다 */
export function StarDetails({ radius }: { radius: number }) {
  const streak = useRef<Mesh>(null)
  const res = useMemo(() => {
    const rnd = seeded(29)
    return {
      sets: Array.from({ length: TWINKLE_SETS }, () => ({
        geo: starPoints(60, radius * 0.98, rnd),
        mat: new PointsMaterial({ color: 0xfff1de, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false }),
      })),
      streakGeo: new PlaneGeometry(1, 1),
      // 별똥별은 하늘이라 번지지 않는다(#305)
      streakMat: noGlow(new MeshBasicMaterial({ map: streakTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false })),
    }
  }, [radius])
  useEffect(
    () => () => {
      res.sets.forEach((s) => {
        s.geo.dispose()
        s.mat.dispose()
      })
      res.streakGeo.dispose()
      res.streakMat.map?.dispose()
      res.streakMat.dispose()
    },
    [res],
  )
  const still = useMemo(() => reducedMotion(), [])
  // 지금 별똥별: 시작 시각 · 출발점 · 방향 · 다음 별똥별 시각
  // side · up: 그때 화면의 가로 · 세로 방향, w: 그 거리에서 화면 반폭(꼬리 길이 · 이동 거리의 기준)
  const shoot = useRef({ t0: -1, from: new Vector3(), dir: new Vector3(), side: new Vector3(), up: new Vector3(), w: 1, next: 4, rnd: seeded(53) })

  useFrame(({ clock, camera }) => {
    if (still) return
    const t = clock.elapsedTime
    res.sets.forEach((s, i) => (s.mat.opacity = 0.55 + 0.35 * Math.sin(t * (1.3 + i * 0.7) + i * 2.1)))

    const sh = shoot.current
    const m = streak.current
    if (!m) return
    if (sh.t0 < 0 && t >= sh.next) {
      // 화면 위쪽 하늘 어딘가에서, 아래로 비스듬히
      // 카메라 화각 안, 화면 위쪽 하늘 어딘가에서 아래로 비스듬히
      const r = sh.rnd
      const fwd = camera.getWorldDirection(new Vector3())
      sh.side.crossVectors(fwd, new Vector3(0, 1, 0)).normalize()
      sh.up.crossVectors(sh.side, fwd).normalize()
      const dist = radius * 0.8
      const cam = camera as { fov?: number; aspect?: number }
      const halfH = dist * Math.tan(((cam.fov ?? 23) * PI) / 360)
      sh.w = halfH * (cam.aspect ?? 1.6)
      sh.from
        .copy(fwd)
        .multiplyScalar(dist)
        .addScaledVector(sh.side, (r() - 0.5) * 1.2 * sh.w)
        .addScaledVector(sh.up, (0.3 + r() * 0.45) * halfH)
      sh.dir.copy(sh.side).multiplyScalar(r() < 0.5 ? -1 : 1).addScaledVector(sh.up, -0.45).normalize()
      sh.t0 = t
    }
    if (sh.t0 >= 0) {
      const k = (t - sh.t0) / SHOOT_S
      if (k >= 1) {
        sh.t0 = -1
        sh.next = t + SHOOT_EVERY[0] + sh.rnd() * (SHOOT_EVERY[1] - SHOOT_EVERY[0])
        res.streakMat.opacity = 0
        m.visible = false
        return
      }
      const len = sh.w * 0.22
      m.visible = true
      m.position.copy(sh.from).addScaledVector(sh.dir, k * sh.w * 0.55)
      // 카메라를 보게 세운 뒤(그러면 띠의 가로가 화면 가로) 진행 방향으로 돌린다 — 밝은 머리(+x)가 앞
      m.lookAt(camera.position)
      m.rotateZ(Math.atan2(sh.dir.dot(sh.up), sh.dir.dot(sh.side)))
      m.scale.set(len, len * 0.025, 1)
      res.streakMat.opacity = Math.sin(k * PI) * 0.9
    }
  })

  return (
    <>
      {res.sets.map((s, i) => (
        <points key={i} geometry={s.geo} material={s.mat} raycast={noRaycast} />
      ))}
      <mesh ref={streak} geometry={res.streakGeo} material={res.streakMat} visible={false} raycast={noRaycast} />
    </>
  )
}
