// 승무원(스페이) 아바타 전용 환경광 — 시안 station.js의 PMREM(위 하늘색 → 아래 보라 그라데이션 구 + 흰 반사판). 소유: C.
// 시안은 이 환경을 r150의 scene.environment로 아바타(표준 재질)에만 비췄다. 지금 three는 scene.environment가 선체의
// Lambert 재질까지 밝히므로, 장면 전체가 아니라 아바타 재질의 envMap에만 붙인다.
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
  type Texture,
  type WebGLRenderer,
} from 'three'

const cache = new WeakMap<WebGLRenderer, Texture>()

export function crewEnvironment(gl: WebGLRenderer): Texture {
  const hit = cache.get(gl)
  if (hit) return hit
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

  const pmrem = new PMREMGenerator(gl)
  const tex = pmrem.fromScene(scene, 0.04).texture
  pmrem.dispose()
  scene.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) {
      m.geometry.dispose()
      ;(m.material as MeshBasicMaterial).dispose()
    }
  })
  cache.set(gl, tex)
  return tex
}
