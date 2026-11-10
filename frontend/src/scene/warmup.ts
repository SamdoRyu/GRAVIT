// 셰이더 미리 컴파일 도우미(#331) — 컴포넌트는 shaderWarmup.tsx. 소유: C.
import { Mesh, PlaneGeometry, Scene, type Camera, type Material, type WebGLRenderer } from 'three'

/** 컴파일이 이 시간 안에 끝나지 않으면 그냥 그리기 시작한다(컨텍스트 유실 등으로 끝나지 않는 경우) */
const WARMUP_LIMIT_MS = 4000

/** 장면 첫 컴파일이 함께 기다릴 일(장면 밖 재질 컴파일) — SceneWarmup이 붙기 전에 넣는다 */
const pending: Promise<unknown>[] = []

export const withLimit = (p: Promise<unknown>, ms: number = WARMUP_LIMIT_MS) => Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))])

/** 지금까지 들어온 기다릴 일을 꺼낸다(SceneWarmup이 한 번) */
export const takePendingWarmups = () => pending.splice(0)

/**
 * 첫 그림을 시작했는지 — 그 전에 붙은 glTF는 SceneWarmup이 같이 컴파일하고, 그 뒤에 붙으면 WarmGroup이 숨겨 두고 컴파일한다.
 * 처음에는 닫혀 있다(같은 커밋에서 SceneWarmup보다 먼저 붙는 묶음도 첫 그림에 함께 나오게).
 */
let gateOpen = false
export const isGateOpen = () => gateOpen
export const closeGate = () => {
  gateOpen = false
}
export const openGate = () => {
  gateOpen = true
}

/** 받고 있는 glTF(Suspense 대기) — 대기가 끝나면(모델이 붙으면) 풀린다 */
const modelWaits = new Set<Promise<void>>()
export const pendingModels = () => [...modelWaits]
export function registerModelWait(): () => void {
  let done = () => {}
  const wait = new Promise<void>((resolve) => {
    done = resolve
  })
  modelWaits.add(wait)
  return () => {
    modelWaits.delete(wait)
    done()
  }
}

/**
 * 장면에 붙지 않는 재질(전체 화면 사각형 · 바꿔 끼우는 재질)을 미리 컴파일한다. 첫 그리기는 이것도 기다린다.
 * 재질 하나씩 임시 사각형에 씌워 컴파일만 하고 버린다(그리지 않는다).
 */
export function warmMaterials(gl: WebGLRenderer, camera: Camera, target: Scene, materials: Material[]) {
  const temp = new Scene()
  const geometry = new PlaneGeometry(1, 1)
  for (const m of materials) temp.add(new Mesh(geometry, m))
  const done = withLimit(gl.compileAsync(temp, camera, target)).finally(() => {
    temp.clear()
    geometry.dispose()
  })
  pending.push(done)
  return done
}
