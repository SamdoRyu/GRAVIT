// 승무원(스페이) 아바타 전용 환경광 — 시안 station.js의 PMREM(위 하늘색 → 아래 보라 그라데이션 구 + 흰 반사판). 소유: C.
// 시안은 이 환경을 r150의 scene.environment로 아바타(표준 재질)에만 비췄다. 지금 three는 scene.environment가 선체의
// Lambert 재질까지 밝히므로, 장면 전체가 아니라 아바타 재질의 envMap에만 붙인다.
// 성능(#331):
// - 지금 three의 PMREM은 거칠기 단계를 GGX 셰이더(표본 256개)로 만드는데, Windows ANGLE에서 이 셰이더 컴파일이 메인 스레드를
//   약 350ms 막는다(미리 · 비동기로 컴파일해도 처음 쓸 때 막힌다). 그래서 시안이 쓰던 three r150처럼 흐림 셰이더만으로
//   단계를 만든다(blurOnlyPmrem — 시안 모양에 더 가깝다).
// - 흐림 · 환경 구 셰이더는 warmCrewEnvironment가 먼저 비동기로 컴파일하고 만들어 둔다. 아직 없으면 crewEnvironment가 그 자리에서 만든다.
import {
  BackSide,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Camera,
  type Material,
  type Texture,
  type WebGLRenderer,
} from 'three'

const cache = new WeakMap<WebGLRenderer, Texture>()
const warming = new WeakMap<WebGLRenderer, Promise<void>>()
/** PMREM 크기(three 기본값) · 흐림 정도(시안 값) */
const PMREM_SIZE = 256
const SIGMA = 0.04

function environmentScene(): Scene {
  const scene = new Scene()
  const sphere = new SphereGeometry(10, 32, 16)
  const p = sphere.attributes.position
  const top = new Color(0xdfe6ff)
  const bottom = new Color(0x6f5f9e)
  const cols: number[] = []
  for (let i = 0; i < p.count; i++) {
    const c = new Color().lerpColors(bottom, top, (p.getY(i) / 10 + 1) / 2)
    cols.push(c.r, c.g, c.b)
  }
  sphere.setAttribute('color', new Float32BufferAttribute(cols, 3))
  scene.add(new Mesh(sphere, new MeshBasicMaterial({ vertexColors: true, side: BackSide })))
  const board = new Mesh(new PlaneGeometry(6, 3), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }))
  board.position.set(-4, 6, 5)
  board.lookAt(0, 0, 0)
  scene.add(board)
  return scene
}

function disposeScene(scene: Scene) {
  scene.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) {
      m.geometry.dispose()
      ;(m.material as MeshBasicMaterial).dispose()
    }
  })
}

/** PMREM 안쪽(비공개) — three가 바꾸면 없을 수 있어 확인하고 쓴다 */
interface PmremInternals {
  _setSize?: (size: number) => void
  _allocateTargets?: () => { dispose: () => void }
  _blur?: (target: unknown, lodIn: number, lodOut: number, sigma: number) => void
  _applyPMREM?: (target: unknown) => void
  _blurMaterial?: Material | null
  _lodMax?: number
  _sizeLods?: number[]
  _lodMeshes?: unknown[]
}
/** three r150 PMREM의 단계별 흐림 정도 — 작은 단계(LOD_MIN 아래)에 쓰던 값 */
const LOD_MIN = 4
const EXTRA_LOD_SIGMA = [0.125, 0.215, 0.35, 0.446, 0.526, 0.582]

/**
 * 거칠기 단계를 GGX 대신 r150처럼 흐림으로 만든다 — 단계 i는 앞 단계를 그 차이만큼 더 흐린다.
 * 비공개 함수가 없으면(three가 바뀜) 손대지 않아 기본(GGX) 방식으로 만들어진다.
 */
function blurOnlyPmrem(pmrem: PMREMGenerator): PMREMGenerator {
  const inner = pmrem as unknown as PmremInternals
  if (typeof inner._blur !== 'function' || typeof inner._applyPMREM !== 'function') return pmrem
  const blur = inner._blur.bind(pmrem)
  inner._applyPMREM = (target) => {
    const lodMax = inner._lodMax ?? 0
    const sizes = inner._sizeLods ?? []
    const n = inner._lodMeshes?.length ?? sizes.length
    const sigmaAt = (i: number) => (i === 0 ? 0 : i > lodMax - LOD_MIN ? (EXTRA_LOD_SIGMA[i - lodMax + LOD_MIN - 1] ?? EXTRA_LOD_SIGMA[EXTRA_LOD_SIGMA.length - 1]) : 1 / sizes[i])
    const gl = (pmrem as unknown as { _renderer: WebGLRenderer })._renderer
    const autoClear = gl.autoClear
    gl.autoClear = false
    for (let i = 1; i < n; i++) blur(target, i - 1, i, Math.sqrt(sigmaAt(i) ** 2 - sigmaAt(i - 1) ** 2))
    gl.autoClear = autoClear
  }
  return pmrem
}

function build(gl: WebGLRenderer, pmrem: PMREMGenerator, scene: Scene): Texture {
  const tex = pmrem.fromScene(scene, SIGMA, 0.1, 100, { size: PMREM_SIZE }).texture
  pmrem.dispose()
  disposeScene(scene)
  cache.set(gl, tex)
  return tex
}

export function crewEnvironment(gl: WebGLRenderer): Texture {
  return cache.get(gl) ?? build(gl, blurOnlyPmrem(new PMREMGenerator(gl)), environmentScene())
}

/**
 * 환경광을 메인 스레드를 막지 않고 만들어 둔다 — 쓰는 셰이더(환경 구 · 반사판 · PMREM 흐림)를 compileAsync로 먼저 컴파일하고,
 * 끝나면 PMREM을 만든다(그때는 컴파일이 끝나 있어 짧다). 여러 번 불러도 한 번만 한다.
 */
export function warmCrewEnvironment(gl: WebGLRenderer, camera: Camera): Promise<void> {
  if (cache.has(gl)) return Promise.resolve()
  const running = warming.get(gl)
  if (running) return running
  const scene = environmentScene()
  const pmrem = blurOnlyPmrem(new PMREMGenerator(gl))
  const inner = pmrem as unknown as PmremInternals
  const shaders = new Scene()
  const plane = new PlaneGeometry(1, 1)
  if (typeof inner._setSize === 'function' && typeof inner._allocateTargets === 'function') {
    inner._setSize(PMREM_SIZE)
    inner._allocateTargets().dispose() // 흐림 재질만 남긴다(같은 크기면 fromScene이 그대로 다시 쓴다)
    if (inner._blurMaterial) shaders.add(new Mesh(plane, inner._blurMaterial))
  }
  scene.children.forEach((o) => shaders.add(new Mesh(plane, (o as Mesh).material as Material)))
  const done = gl
    .compileAsync(shaders, camera)
    .then(() => {
      shaders.clear()
      plane.dispose()
      if (!cache.has(gl)) build(gl, pmrem, scene)
      else {
        // 기다리는 사이 crewEnvironment가 먼저 만들었다
        pmrem.dispose()
        disposeScene(scene)
      }
    })
    .finally(() => warming.delete(gl))
  warming.set(gl, done)
  return done
}
