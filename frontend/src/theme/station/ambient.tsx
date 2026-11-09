// 정거장 생기 연출 (#285 — 팀 결정 2026-11-09). 새 에셋 없이 지금 부품에 발광 · 깜빡임만 더한다:
// 콘솔 화면의 은은한 밝기 변화와 가끔 깜빡임 · 안테나 경고등 점멸 · 도킹 유도등 흐름 · 태양전지판 빛 띠 · 창문(테두리 · 허브 · 접시)
// 불빛 숨쉬기. 정거장 · 아바타 · 배지 가독성을 해치지 않게 약하게 한다. 움직임 줄이기면 불은 켜 두되 움직이지 않는다.
// 부품은 자기 애니메이션을 등록만 하고, <StationAmbient/> 하나가 매 프레임 돌린다. 소유: C.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, MeshBasicMaterial, SpriteMaterial, type Mesh } from 'three'
import { noRaycast } from '../../scene/runtime'
import { glowTex } from './parts'

type V3 = [number, number, number]
/** t = 경과 초, still = 움직임 줄이기 */
type Animate = (t: number, still: boolean) => void

const animations = new Set<Animate>()
function useAnimate(fn: Animate) {
  useEffect(() => {
    animations.add(fn)
    return () => {
      animations.delete(fn)
    }
  }, [fn])
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** 자리 → 0 ~ 1 박자 차이(같은 종류 불빛이 한꺼번에 깜빡이지 않게) */
function phaseOf(p: V3): number {
  const h = Math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719) * 43758.5453
  return h - Math.floor(h)
}
/** 정수 → 0 ~ 1(깜빡임을 언제 할지 고르는 데 쓴다) */
function hash1(n: number): number {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return h - Math.floor(h)
}

/** 등록된 애니메이션을 매 프레임 돌린다 — 정거장 본체에 하나 */
export function StationAmbient() {
  const still = useMemo(() => reducedMotion(), [])
  useFrame(({ clock }) => {
    const t = still ? 0 : clock.elapsedTime
    for (const fn of animations) fn(t, still)
  })
  return null
}

// ---------------------------------------------------------------- 콘솔 화면

/** 콘솔 화면 빛 — 몇 초마다 은은하게 밝아졌다 어두워지고, 가끔(평균 몇십 초에 한 번) 0.1초쯤 깜빡인다 */
export function ConsoleScreen({ color, at, position, rotation, size }: { color: number; at: V3; position: V3; rotation: V3; size: [number, number] }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  const base = useMemo(() => new Color(color), [color])
  const ph = useMemo(() => phaseOf(at), [at])
  const animate = useMemo<Animate>(
    () => (t, still) => {
      if (still) {
        mat.color.copy(base)
        return
      }
      let level = 0.86 + 0.14 * Math.sin(t * (0.6 + ph * 0.5) + ph * 6.28)
      const tick = Math.floor(t * 8 + ph * 97)
      if (hash1(tick) < 0.012) level *= 0.45
      mat.color.copy(base).multiplyScalar(level)
    },
    [mat, base, ph],
  )
  useAnimate(animate)
  return (
    <mesh position={position} rotation={rotation} material={mat} raycast={noRaycast}>
      <planeGeometry args={size} />
    </mesh>
  )
}

// ---------------------------------------------------------------- 깜빡이는 빛 번짐

/**
 * 움직이는 빛 번짐(Glow와 같은 모양).
 * - breathe: 천천히 숨 쉬듯 밝기 변화(창문 · 테두리 불빛)
 * - blink: 경고등 — 1.6초마다 짧게 켜짐
 * - chase: 유도등 — 묶음 안에서 index 차례로 켜졌다 꺼짐(count개)
 */
export function AmbientGlow({
  color,
  size,
  p,
  opacity = 0.8,
  mode,
  index = 0,
  count = 1,
}: {
  color: number
  size: number
  p: V3
  opacity?: number
  mode: 'breathe' | 'blink' | 'chase'
  index?: number
  count?: number
}) {
  const mat = useMemo(() => new SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }), [color, opacity])
  useEffect(() => () => mat.dispose(), [mat])
  const ph = useMemo(() => phaseOf(p), [p])
  const animate = useMemo<Animate>(
    () => (t, still) => {
      let k: number
      if (mode === 'breathe') k = still ? 0.85 : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 0.55 + ph * 6.28))
      else if (mode === 'blink') {
        const c = (t + ph) % 1.6
        k = still ? 0.9 : c < 0.16 ? 1 : c < 0.4 ? 1 - (c - 0.16) / 0.24 * 0.85 : 0.15
      } else {
        // 앞에서부터 차례로: 내 차례에 밝게, 그 뒤 빠르게 꺼짐
        const c = (((t * 0.9 - index / count) % 1) + 1) % 1
        k = still ? 0.6 : 0.3 + 0.7 * Math.max(0, 1 - c * 4)
      }
      mat.opacity = opacity * k
    },
    [mat, mode, ph, index, count, opacity],
  )
  useAnimate(animate)
  return <sprite material={mat} position={p} scale={[size, size, 1]} raycast={noRaycast} />
}

// ---------------------------------------------------------------- 태양전지판 빛 띠

/** 태양전지판 위를 빛 한 줄이 천천히 쓸고 지나간다(약 2.4초, 그다음 3.6초 쉼). 판 가운데 · 크기(x × z) · 시작 지연 */
export function PanelGlint({ center, size, delay }: { center: V3; size: [number, number]; delay: number }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const band = size[0] * 0.14
  const mesh = useRef<Mesh>(null)
  const animate = useMemo<Animate>(
    () => (t, still) => {
      const m = mesh.current
      if (!m) return
      if (still) {
        mat.opacity = 0
        return
      }
      const cycle = 6
      const c = (((t - delay) % cycle) + cycle) % cycle
      const k = c / 2.4
      if (k >= 1) {
        mat.opacity = 0
        return
      }
      m.position.x = center[0] - size[0] / 2 + band / 2 + k * (size[0] - band)
      mat.opacity = 0.5 * Math.sin(k * Math.PI)
    },
    [mat, center, size, delay, band],
  )
  useAnimate(animate)
  return (
    <mesh
      ref={mesh}
      position={center}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      raycast={noRaycast}
    >
      <planeGeometry args={[band, size[1]]} />
    </mesh>
  )
}

// ---------------------------------------------------------------- 도킹 유도등

/**
 * 링에 박힌 작은 램프 — 묶음 안에서 index 차례로 켜졌다 꺼진다. 링이 밝은 색이라 더하기 빛(Glow)만으로는 묻혀서,
 * 램프 자체는 보통 색(어두운 청록 ↔ 밝은 청록)으로 칠하고 켜질 때만 작은 빛 번짐을 더한다.
 */
export function ChaseLamp({ p, index, count }: { p: V3; index: number; count: number }) {
  const res = useMemo(
    () => ({
      lamp: new MeshBasicMaterial({ color: 0x2b5c63 }),
      halo: new SpriteMaterial({ map: glowTex(), color: 0x8ff0e0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
      dim: new Color(0x2b5c63),
      lit: new Color(0x9ffcf0),
    }),
    [],
  )
  useEffect(
    () => () => {
      res.lamp.dispose()
      res.halo.dispose()
    },
    [res],
  )
  const animate = useMemo<Animate>(
    () => (t, still) => {
      const c = (((t * 0.9 - index / count) % 1) + 1) % 1
      const k = still ? 0.6 : Math.max(0, 1 - c * 4)
      res.lamp.color.lerpColors(res.dim, res.lit, k)
      res.halo.opacity = 0.75 * k
    },
    [res, index, count],
  )
  useAnimate(animate)
  return (
    <group position={p}>
      <mesh material={res.lamp} raycast={noRaycast}>
        <sphereGeometry args={[0.2, 8, 6]} />
      </mesh>
      <sprite material={res.halo} scale={[1.3, 1.3, 1]} raycast={noRaycast} />
    </group>
  )
}
