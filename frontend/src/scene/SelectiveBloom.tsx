// 선택 빛 번짐(bloom, #305 — 팀 결정 2026-11-09). 정한 불빛(bloom.ts — 빛 무리 · 불꽃 · 빛 줄기 · 콘솔 화면 등)만 은은하게 번지고,
// 벽 · 행성 · 상자는 번지지 않는다. 방법: 번짐용으로 장면을 한 번 더(절반 해상도) 그리는데, 번지지 않는 불투명 물체는 검게(빛을 가린다 —
// 벽 뒤 불빛은 벽에 가려 번지지 않는다), 번지지 않는 반투명 · 점 · 선은 숨겨서 그린다. 그 결과를 흐려 화면 위에 더한다.
// 화면 자체는 지금처럼 캔버스에 바로 그린다(캔버스의 계단 현상 방지를 그대로 쓴다 — 다중 표본 중간 버퍼는 내장 GPU에서 너무 무겁다).
// 저사양(LOW_POWER)이면 끈다. 주소에 ?bloom=0이면 끈다(비교 · 문제 확인용).
// 소유: C.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BackSide, DoubleSide, FrontSide, HalfFloatType, Line, Mesh, MeshBasicMaterial, Points, Sprite, Vector2, type ShaderMaterial, WebGLRenderTarget, type Material, type Object3D } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { bloomGain, blooms } from './bloom'
import { LOW_POWER } from './runtime'

/** 번짐 세기 · 퍼짐 · 번짐용 해상도 비율 */
const STRENGTH = 0.6
const RADIUS = 0.45
const BLOOM_RES = 0.5

const BLOOM_ENABLED = !LOW_POWER && (typeof location === 'undefined' || new URLSearchParams(location.search).get('bloom') !== '0')

/**
 * 번짐용 그리기에서 번지지 않는 불투명 물체가 쓰는 재질 — 빛을 가리기만 한다. 원래 재질과 같은 면을 그려야 한다:
 * 모듈 안쪽 벽은 뒷면(BackSide) · 끝 캡은 양면이라, 앞면만 그리면 그 벽이 빛을 못 가려 안쪽 불빛이 벽 너머로 번진다.
 */
const BLACK = {
  [FrontSide]: new MeshBasicMaterial({ color: 0x000000, fog: false, side: FrontSide }),
  [BackSide]: new MeshBasicMaterial({ color: 0x000000, fog: false, side: BackSide }),
  [DoubleSide]: new MeshBasicMaterial({ color: 0x000000, fog: false, side: DoubleSide }),
}

type Drawable = Mesh | Sprite | Points | Line

export function SelectiveBloom() {
  if (!BLOOM_ENABLED) return null
  return <BloomPasses />
}

function BloomPasses() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const fx = useMemo(() => {
    const composer = new EffectComposer(gl, new WebGLRenderTarget(1, 1, { type: HalfFloatType }))
    composer.renderToScreen = false
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new Vector2(1, 1), STRENGTH, RADIUS, 0))
    // 흐린 번짐을 화면 위에 더한다
    const overlay = new MeshBasicMaterial({ map: composer.renderTarget2.texture, blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    return { composer, overlay, quad: new FullScreenQuad(overlay), saved: new Map<Drawable, Material | Material[]>(), hidden: [] as Object3D[], dimmed: new Map<Material, number>() }
  }, [gl, scene, camera])

  useEffect(() => {
    fx.composer.setPixelRatio(dpr * BLOOM_RES)
    fx.composer.setSize(size.width, size.height)
  }, [fx, size, dpr])
  useEffect(
    () => () => {
      fx.composer.dispose()
      fx.overlay.dispose()
      fx.quad.dispose()
    },
    [fx],
  )

  useFrame(() => {
    const { saved, hidden, dimmed } = fx
    // 1) 번짐용: 번지지 않는 것은 검게 · 숨겨서 절반 해상도로
    scene.traverseVisible((o) => {
      const d = o as Drawable
      if (!(d instanceof Mesh || d instanceof Sprite || d instanceof Points || d instanceof Line)) return
      const m = d.material
      const one = Array.isArray(m) ? m[0] : m
      if (!one) return
      if (blooms(one)) {
        const g = bloomGain(one)
        if (g !== 1 && !dimmed.has(one)) {
          const u = (one as Partial<ShaderMaterial>).uniforms?.opacity
          dimmed.set(one, u ? u.value : one.opacity)
          if (u) u.value *= g
          else one.opacity *= g
        }
        return
      }
      if (d instanceof Mesh && !one.transparent) {
        saved.set(d, m)
        d.material = BLACK[one.side]
      } else hidden.push(d)
    })
    for (const o of hidden) o.visible = false
    const bg = scene.background
    scene.background = null
    const autoShadow = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    fx.composer.render()
    gl.shadowMap.autoUpdate = autoShadow
    scene.background = bg
    for (const o of hidden) o.visible = true
    for (const [d, m] of saved) d.material = m
    saved.clear()
    for (const [m, o] of dimmed) {
      const u = (m as Partial<ShaderMaterial>).uniforms?.opacity
      if (u) u.value = o
      else m.opacity = o
    }
    dimmed.clear()
    hidden.length = 0
    // 2) 화면: 평소처럼 캔버스에 그리고, 3) 그 위에 번짐을 더한다
    gl.setRenderTarget(null)
    gl.render(scene, camera)
    const autoClear = gl.autoClear
    gl.autoClear = false
    fx.quad.render(gl)
    gl.autoClear = autoClear
  }, 1)

  return null
}
