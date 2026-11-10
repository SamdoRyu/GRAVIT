// 셰이더 미리 컴파일(#331). 재질을 처음 그릴 때 three.js는 셰이더 컴파일 · 링크가 끝날 때까지 메인 스레드를 막는다
// (Windows ANGLE에서는 수백 ms) — 성능 점검의 TBT가 여기서 나온다. 그래서
// - 장면이 처음 붙으면 그리기를 잠시 멈추고(frameloop 'never') renderer.compileAsync로 모든 재질을 미리 · 비동기로 컴파일한 뒤 그리기 시작한다.
//   빛 번짐처럼 장면 밖에서 쓰는 재질은 warmMaterials(warmup.ts)로 같이 기다리게 한다.
// - 그때 받고 있는 glTF(승무원 · 라코 — Suspense 대기 중인 ModelPending)도 MODEL_WAIT_MS까지 기다려 같이 컴파일한다. 그래서 로컬처럼
//   빨리 오면 정거장 · 승무원 · 라코가 첫 그림에 함께 보인다(나중에 툭 나타나지 않는다). 그보다 늦으면 정거장부터 그린다.
// - 첫 그림 뒤에 붙는 glTF(늦게 온 모델 · 처음 날아오는 라코)는 WarmGroup이 컴파일이 끝날 때까지 숨겨 둔다(숨긴 물체는 그리지 않아 막히지 않는다).
// - 승무원 · 라코의 환경광(PMREM)도 같이 막힘 없이 만든다(warmCrewEnvironment).
// - 기다리는 동안 캔버스는 검게 두고, 첫 그림이 그려지면 어둠에서 서서히 밝힌다(holdDark).
// KHR_parallel_shader_compile이 없는 브라우저에서도 compileAsync는 동작한다(조금 기다렸다 확인). 끝나지 않는 경우에 대비해 상한을 둔다.
// 소유: C.
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { type Group } from 'three'
import { warmCrewEnvironment } from '../theme/station/crewEnvironment'
import { closeGate, isGateOpen, openGate, pendingModels, registerModelWait, takePendingWarmups, withLimit } from './warmup'

/** 첫 그림이 받고 있는 glTF를 기다리는 최대 시간 — 로컬이면 이보다 훨씬 빨리 온다. 느린 네트워크에서는 정거장부터 보인다 */
const MODEL_WAIT_MS = 1500
/** 첫 그림이 어둠에서 밝아지는 시간 */
const FADE_IN_MS = 450
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * 기다리는 동안 3D 영역을 검게 덮고(빈 캔버스 뒤 밝은 페이지가 비치지 않게), 첫 그림이 그려지면 서서히 밝힌다.
 * 덮는 것은 캔버스와 그 위에 띄운 HTML 표시(PR 추천 수 · 이름표 등 — drei Html은 Canvas 상자 안에 붙는다)를 함께 담은 Canvas 상자다.
 * HUD는 그 밖이라 그대로 보인다. CSS filter는 끝나면 지운다. 움직임 줄이기면 바로 보인다.
 */
function holdDark(box: HTMLElement) {
  box.style.backgroundColor = '#000'
  box.style.filter = 'brightness(0)'
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    box.style.transition = ''
    box.style.filter = ''
    box.style.backgroundColor = ''
  }
  return {
    /** 첫 그림 뒤 밝힌다 — 두 프레임 기다려 첫 그림이 화면에 올라간 다음 */
    reveal() {
      if (reducedMotion()) return clear()
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          box.style.transition = `filter ${FADE_IN_MS}ms ease-out`
          box.style.filter = 'brightness(1)'
          timer = setTimeout(clear, FADE_IN_MS + 50)
        }),
      )
    },
    cancel() {
      if (timer) clearTimeout(timer)
      clear()
    },
  }
}

/**
 * 장면의 마지막 자식으로 둔다 — 형제들이 모두 붙은 뒤(레이아웃 효과는 앞 형제부터 돈다) 그리기를 멈추고 미리 컴파일한 다음 그리기를 시작한다.
 * 배포 빌드에서는 셰이더 오류 확인(getProgramInfoLog — 이것도 컴파일을 기다리게 한다)을 끈다.
 */
export function SceneWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const setFrameloop = useThree((s) => s.setFrameloop)
  useLayoutEffect(() => {
    gl.debug.checkShaderErrors = import.meta.env.DEV
    let live = true
    closeGate()
    setFrameloop('never')
    // Canvas 상자 — R3F는 바깥 div > 안쪽 div > canvas로 만들고, drei Html(PR 추천 수 · 이름표 등)은 바깥 div에 붙는다
    const box = gl.domElement.parentElement?.parentElement ?? gl.domElement
    const dark = holdDark(box)
    const waits = [
      withLimit(gl.compileAsync(scene, camera)),
      ...takePendingWarmups(),
      withLimit(warmCrewEnvironment(gl, camera)),
      withLimit(Promise.all(pendingModels()), MODEL_WAIT_MS),
    ]
    void Promise.all(waits)
      // 그사이 붙은 glTF까지 한 번 더(이미 컴파일된 셰이더는 건너뛴다)
      .then(() => (live ? withLimit(gl.compileAsync(scene, camera)) : null))
      .then(() => {
        if (!live) return
        openGate()
        setFrameloop('always')
        dark.reveal()
      })
    return () => {
      live = false
      closeGate() // 장면이 내려간다 — 다시 붙으면 첫 그림부터 다시 기다린다
      setFrameloop('always')
      dark.cancel()
    }
    // 첫 마운트 한 번만 — 사무실을 바꿔도 장면(Canvas)은 그대로다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** glTF를 받는 동안의 Suspense fallback — 첫 그림이 이 모델을 기다리게 한다(그림은 없다) */
export function ModelPending() {
  useLayoutEffect(() => registerModelWait(), [])
  return null
}

/** 첫 그림 뒤에 붙는 무거운 묶음(glTF) — 셰이더 컴파일이 끝날 때까지 숨겨 둔다. 첫 그림 전이면 SceneWarmup이 같이 컴파일한다 */
export function WarmGroup({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const g = ref.current
    if (!g || !isGateOpen()) return
    let live = true
    g.visible = false
    void withLimit(gl.compileAsync(g, camera, scene)).then(() => {
      if (live) g.visible = true
    })
    return () => {
      live = false
    }
    // 붙을 때 한 번 — 같은 재질을 쓰는 다음 묶음은 이미 컴파일된 셰이더를 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <group ref={ref}>{children}</group>
}
