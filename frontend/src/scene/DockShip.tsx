// 도킹 베이 끝에 붙어 있는 우주선 — 사무실 바꾸기 (팀 결정 2026-11-09, #267). 처음 쓰는 사람을 위해 상단 바 더보기의 "사무실 바꾸기"도 그대로 둔다.
// 우주선은 도킹 링 앞에 가로로 누워 동체 옆 해치가 짧은 연결 통로로 링에 이어져 있다. 누르면 갈 수 있는 다른 정거장(들어갈 수
// 있는 다른 사무실) 목록이 뜨고, 고르면 우주선이 통로에서 떨어져 기수 쪽 화면 밖으로 날아간 뒤 그 사무실이 열린다. 새 정거장(같은
// 모델)에서는 우주선이 기수를 진행 방향으로 두고 화면 밖에서 들어와 멈춘 뒤, 세로로 반 바퀴 돌아(반 롤로 바로 서며) 기수를 서쪽으로
// 맞추고 통로에 붙는다(scene/shipFlight.ts). "정거장 목록 화면으로"는 사무실 고르기
// 화면(새 레포의 사무실 열기도 거기 있다)으로 간다. 움직임 줄이기 설정이면 비행 없이 바로 옮긴다.
// 우주선은 시안 팔레트의 기본 도형으로 만든다(새 glTF 없음).
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AdditiveBlending, MeshBasicMaterial, Vector3, type Group } from 'three'
import type { Id, WorkspaceListItem } from '../data/types'
import { useSession } from '../session'
import { useOffice } from '../store'
import { COLORS, lam } from '../theme/station/parts'
import { DOCK, HULL_Y, STATION_BOUNDS, WORLD_SCALE } from '../theme/station/geometry'
import { skyPaletteFor } from '../theme/station/skyPalette'
import { cameraLock, clickSlop, noRaycast, setCursor, shipLive } from './runtime'
import { SceneHtml } from './shared'
import { INTRO_IN_S, SHIP_INTRO_S, shipPose, warpLevel, type ShipFlight } from './shipFlight'
import { easeInOut } from './cameraFocus'

/** 궤도 진입 입장 연출을 시작하라는 신호 — 도착 장면(ui/entry/Landing)이 덮개를 걷을 때 보낸다. 주소에 ?intro=1이면 장면이 뜰 때도 */
export const ARRIVAL_INTRO_EVENT = 'gravit:arrival-intro'
/** 궤도 진입 동안 카메라가 우주선을 따라가는 자리(시안 단위, 우주선 기준): 뒤 · 위 · 남쪽(기본 카메라 쪽) · 바라볼 점은 기수 앞 */
const CHASE = { back: 30, up: 10, south: 26, ahead: 12 }
/** 궤도 진입 동안의 화각(도) — 장면 화각(23°, 망원)으로 가까이 따라가면 답답해서 넓혔다가, 원래 시점으로 빠지며 돌아간다 */
const INTRO_FOV = 42
/**
 * 궤도 진입 카메라의 앞부분: 행성 근접 시점(앞의 2D 행성 줌인이 끝난 자리 — 행성이 화면을 채운다)에서 궤도로 진입해 우주선 뒤에
 * 붙는 시간(초). 시작 자리는 원래 시점의 방향으로 행성 중심에서 PLANET_VIEW.dist(행성 반지름 배)만큼, 바라보는 점은 행성 윗부분
 */
const INTRO_PRE_S = 2.2
const PLANET = { y: -236, r: 200 } // StationSky 행성(시안 단위, 정거장 바닥 아래 중심)
const PLANET_VIEW = { dist: 2.15, rise: 0.35, look: 0.85 }
/** 원래 시점을 아직 모를 때(장면이 막 붙은 첫 프레임들) 쓰는 바라보는 방향 — 처음 카메라(app/SceneCanvas)가 정거장을 보는 방향 */
const DEFAULT_VIEW_DIR: [number, number] = [38.8 - 12.6, 34.6 - 8.4]
/** 원래 시점과 섞기 시작하는 때(다 올라오기 0.8초 전) · 카메라가 목표 자리를 쫓는 빠르기(클수록 바짝) */
const INTRO_BLEND_FROM = INTRO_IN_S - 0.8
const INTRO_FOLLOW = 4.5
const introV = { nose: new Vector3(), pos: new Vector3(), tgt: new Vector3(), home: new Vector3(), homeT: new Vector3(), pp: new Vector3(), pt: new Vector3() }

/** 동체 옆 해치(우주선 좌표 — 꼬리에서 기수 쪽 거리)와 동체 반지름 */
const HATCH_Z = 4.1
const HULL_R = 1.45
/** 도킹 링 바깥면(StationEnvironment Dock — 링 z 41.8, 굵기 0.45)과 연결 통로 길이 */
const RING_FACE_Z = 42.25
const BRIDGE_LEN = 2.0
/** 동체 가운데(우주선 좌표 — 꼬리에서 기수 쪽 거리). 도착해서 세로로 돌 때 이 점을 중심으로 돈다 */
const SHIP_MID = 3.2
/**
 * 붙어 있을 때 동체 가운데의 자리(시안 단위). 기수는 서쪽(-x)이고 해치가 링 중심(x = DOCK.x)에 오도록 가운데는 그 동쪽
 * (HATCH_Z - SHIP_MID), 동체 축은 링에서 통로 길이 + 반지름만큼 남쪽.
 */
const DOCKED = { x: DOCK.x + HATCH_Z - SHIP_MID, y: HULL_Y, z: RING_FACE_Z + BRIDGE_LEN + HULL_R } as const
/** 붙어 있을 때의 방향: 우주선 좌표의 기수(+z)가 서쪽(-x)을 보게 */
const DOCKED_YAW = -Math.PI / 2
const ROLE_LABEL: Record<WorkspaceListItem['myRole'], string> = { repo_admin: '레포 관리자', participant: '참여자', instructor: '강사' }
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** 고른 곳: 다른 사무실, 또는 사무실 고르기 화면 */
type Destination = { kind: 'workspace'; id: Id } | { kind: 'picker' }

function go(dest: Destination) {
  if (dest.kind === 'picker') useSession.getState().leaveWorkspace()
  else void useSession.getState().travelToWorkspace(dest.id)
}

const flameMat = new MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false })

/** 우주선 모양(우주선 좌표: 꼬리 = 원점, 기수 = +z, 해치 쪽 = -x — 놓을 때 기수가 서쪽, 해치가 링 쪽을 보게 돌린다) */
function ShipBody({ flames }: { flames: React.RefObject<Group | null> }) {
  return (
    <>
      {/* 동체 */}
      <mesh position={[0, 0, 2.6]} rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.skin)} castShadow>
        <cylinderGeometry args={[HULL_R - 0.1, HULL_R, 4.4, 14]} />
      </mesh>
      {/* 머리 */}
      <mesh position={[0, 0, 5.9]} rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.skin)}>
        <coneGeometry args={[HULL_R - 0.1, 2.2, 14]} />
      </mesh>
      {/* 주황 띠 */}
      <mesh position={[0, 0, 0.9]} rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.trim)}>
        <cylinderGeometry args={[HULL_R + 0.03, HULL_R + 0.03, 0.35, 14]} />
      </mesh>
      {/* 옆 해치 — 연결 통로가 붙는 곳 */}
      <mesh position={[-HULL_R + 0.05, 0, HATCH_Z]} rotation={[0, 0, Math.PI / 2]} material={lam(COLORS.trim)}>
        <cylinderGeometry args={[0.85, 0.85, 0.3, 14]} />
      </mesh>
      {/* 주 엔진 */}
      <mesh position={[0, 0, -0.1]} rotation={[-Math.PI / 2, 0, 0]} material={lam(COLORS.metal)}>
        <coneGeometry args={[0.95, 0.9, 14, 1, true]} />
      </mesh>
      {/* 조종석 창 */}
      <mesh position={[0, 0.95, 4.7]} rotation={[0.5, 0, 0]} material={lam(COLORS.screen, { emissive: 0x1a2a55 })}>
        <boxGeometry args={[1.3, 0.35, 1.1]} />
      </mesh>
      {/* 날개 */}
      <mesh position={[0, -0.35, 1.9]} material={lam(COLORS.hull)}>
        <boxGeometry args={[5.6, 0.22, 1.8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 2.6, -0.35, 1.3]}>
          {/* 날개 끝 엔진 */}
          <mesh rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.metal)}>
            <cylinderGeometry args={[0.45, 0.55, 2.0, 10]} />
          </mesh>
          <mesh position={[0, 0.5, 0.6]} material={lam(COLORS.trim)}>
            <boxGeometry args={[0.18, 0.7, 1.0]} />
          </mesh>
        </group>
      ))}
      {/* 분사 불꽃 — 세기는 비행이 정한다 */}
      <group ref={flames}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 2.6, -0.35, -0.4]} rotation={[-Math.PI / 2, 0, 0]} material={flameMat} raycast={noRaycast}>
            <coneGeometry args={[0.42, 1.6, 10]} />
          </mesh>
        ))}
        <mesh position={[0, 0, -1.2]} rotation={[-Math.PI / 2, 0, 0]} material={flameMat} raycast={noRaycast}>
          <coneGeometry args={[0.8, 2.4, 12]} />
        </mesh>
      </group>
    </>
  )
}

/** 갈 수 있는 다른 정거장 목록 — 우주선 위에 뜬다 */
function DestinationList({ onPick, onClose }: { onPick: (d: Destination) => void; onClose: () => void }) {
  const current = useOffice((s) => s.office?.workspaceId ?? null)
  const [items, setItems] = useState<WorkspaceListItem[] | null | 'loading'>('loading')
  useEffect(() => {
    let alive = true
    void useSession
      .getState()
      .listWorkspaces()
      .then((list) => alive && setItems(list))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const others = Array.isArray(items) ? items.filter((w) => w.id !== current) : []
  // 정거장마다 그 사무실의 행성 색 점(#277) — 배경과 같은 짝짓기
  const accessible = Array.isArray(items) ? items.map((w) => w.id) : null
  return (
    <div
      role="dialog"
      aria-label="다른 정거장으로 이동"
      className="ship-dest"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 260,
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 14,
        padding: '10px 10px 8px',
        boxShadow: '0 8px 28px rgba(30,45,90,0.3)',
        font: '13px var(--font, sans-serif)',
        color: '#1b2333',
        transform: 'translateY(-50%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 6px' }}>
        <strong style={{ fontSize: 13.5 }}>어느 정거장으로 갈까요?</strong>
        <button type="button" aria-label="닫기" onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7487' }}>
          ×
        </button>
      </div>
      {items === 'loading' && <p style={{ margin: '6px 2px', color: '#6b7487' }}>정거장 목록을 읽는 중…</p>}
      {items === null && <p style={{ margin: '6px 2px', color: '#b4442f' }}>정거장 목록을 불러오지 못했어요.</p>}
      {Array.isArray(items) && others.length === 0 && <p style={{ margin: '6px 2px', color: '#6b7487' }}>갈 수 있는 다른 정거장이 없어요.</p>}
      {others.length > 0 && (
        <ul aria-label="갈 수 있는 정거장" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflowY: 'auto' }}>
          {others.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onPick({ kind: 'workspace', id: w.id })}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, padding: '7px 8px', border: 0, borderRadius: 9, background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1eefa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span
                  aria-hidden="true"
                  style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: `#${skyPaletteFor(w.id, accessible).swatch.toString(16).padStart(6, '0')}`, boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3px rgba(30,45,90,0.12)' }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{w.displayName}</span>
                {w.kind === 'demo' && <span className="flag">시연</span>}
                <span className="flag">{ROLE_LABEL[w.myRole]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onPick({ kind: 'picker' })}
        style={{ width: '100%', marginTop: 6, padding: '7px 8px', border: '1px solid #e1dcef', borderRadius: 9, background: '#faf8ff', cursor: 'pointer', font: 'inherit', color: '#4b4f6b' }}
      >
        정거장 목록 화면으로
      </button>
    </div>
  )
}

export function DockShip() {
  const root = useRef<Group>(null)
  const flames = useRef<Group>(null)
  const pitchG = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const rollG = useRef<Group>(null)
  const flight = useRef<{ kind: ShipFlight; t: number; dest: Destination | null } | null>(null)
  // 궤도 진입 카메라: 진행 중인지 · 첫 프레임을 지났는지 · 지금(감쇠된) 자리 · 화각 · 마무리 시한
  const introCam = useRef({ active: false, init: false, pos: new Vector3(), tgt: new Vector3(), fov: 0, settleUntil: Infinity })
  /** 입장 연출 전 화각(돌려놓을 값) */
  const introFov = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    shipLive.flight = null
    return () => {
      shipLive.flight = null
      setCursor('')
    }
  }, [])

  // 궤도 진입 입장: 우주선이 행성 지평선 아래에서 궤도를 따라 떠올라 정거장에 붙고, 카메라는 그 뒤를 따라가다 원래 시점으로 빠진다.
  // 움직임 줄이기면 하지 않는다. 그동안 사용자 카메라 조작은 잠근다(CameraRig는 cameraLock.intro 동안 멈춘다).
  // 장면이 그려지기 전에 시작하도록 레이아웃 단계에서 건다 — 주소의 ?intro=1이면 첫 프레임부터 행성 시점(자리 잡은 정거장이 먼저 보이지 않게)
  useLayoutEffect(() => {
    const start = () => {
      if (reducedMotion()) return
      setOpen(false)
      setHovered(false)
      introCam.current = { active: true, init: false, pos: new Vector3(), tgt: new Vector3(), fov: 0, settleUntil: Infinity }
      flight.current = { kind: 'intro', t: 0, dest: null }
      cameraLock.intro = true
      if (cameraLock.controls) cameraLock.controls.enabled = false
    }
    window.addEventListener(ARRIVAL_INTRO_EVENT, start)
    if (new URLSearchParams(window.location.search).get('intro') === '1') start()
    return () => {
      window.removeEventListener(ARRIVAL_INTRO_EVENT, start)
      if (cameraLock.intro) {
        cameraLock.intro = false
        if (cameraLock.controls) cameraLock.controls.enabled = true
      }
    }
  }, [])

  const pick = (dest: Destination) => {
    setOpen(false)
    setHovered(false)
    setCursor('')
    if (reducedMotion()) {
      go(dest)
      return
    }
    flight.current = { kind: 'depart', t: 0, dest }
  }

  useFrame(({ camera }, delta) => {
    const g = root.current
    if (!g) return
    const f = flight.current
    const pose = f ? shipPose(f.kind, (f.t += Math.min(delta, 0.1))) : { forward: 0, dz: 0, dy: 0, yaw: 0, pitch: 0, roll: 0, thrust: 0, done: false }
    g.position.set((DOCKED.x - pose.forward) * WORLD_SCALE, (DOCKED.y + pose.dy) * WORLD_SCALE, (DOCKED.z + pose.dz) * WORLD_SCALE)
    // 그룹 중첩 = shipFlight.shipAxes의 순서: 남북 축 pitch(바깥) → 위아래 축 yaw → 동체 축 roll(안쪽, 우주선 좌표의 기수 축 +z는 월드 -x라 부호를 뒤집는다)
    if (pitchG.current) pitchG.current.rotation.z = pose.pitch
    if (spin.current) spin.current.rotation.y = DOCKED_YAW + pose.yaw
    if (rollG.current) rollG.current.rotation.z = -pose.roll
    // 비행 중이 아니면 살짝 떠 있는 듯 흔들린다
    if (!f) g.position.y += Math.sin(performance.now() / 900) * 0.012
    const fl = flames.current
    if (fl) {
      const s = pose.thrust > 0 ? 0.4 + pose.thrust : 0
      fl.visible = s > 0
      fl.scale.set(1, 1, s || 1)
    }
    shipLive.x = g.position.x
    shipLive.y = g.position.y
    shipLive.z = g.position.z
    shipLive.flight = f?.kind ?? null
    // 워프 세기 — 배경(WarpStreaks)이 별빛 줄기 · 섬광을 그린다
    shipLive.warp = f ? warpLevel(f.kind, f.t) : 0

    // 궤도 진입 카메라: 목표 자리 = 우주선을 따라가는 자리와 원래 시점을 섞은 것(다 올라오기 조금 전부터 끝까지 부드럽게 원래 시점 쪽으로).
    // 카메라는 그 자리를 감쇠로 쫓아가 끊기는 곳이 없다. 우주선이 붙은 뒤에도 카메라가 원래 시점에 거의 닿을 때까지 조금 더 이어 간다.
    const c = cameraLock.controls
    shipLive.fovKick = f?.kind !== 'intro'
    const ic = introCam.current
    if (ic.active) {
      // 궤도 조작은 붙는 대로 잠근다(장면 첫 프레임엔 아직 없을 수 있다)
      if (c) c.enabled = false
      const S = WORLD_SCALE
      const cam = camera as import('three').PerspectiveCamera
      if (introFov.current === null) introFov.current = cam.fov
      const home = cameraLock.home()
      let b = 1
      if (f?.kind === 'intro') {
        // 올라오는 동안은 기수(진행) 방향 기준, 다 올라온 뒤(도는 동안)는 동쪽 기준 — 도는 우주선을 따라 흔들리지 않게
        const climbing = f.t < INTRO_IN_S
        introV.nose.set(climbing ? Math.cos(pose.pitch) : 1, climbing ? Math.sin(pose.pitch) : 0, 0)
        introV.pos.copy(g.position).addScaledVector(introV.nose, -CHASE.back * S)
        introV.pos.y += CHASE.up * S
        introV.pos.z += CHASE.south * S
        introV.tgt.copy(g.position).addScaledVector(introV.nose, CHASE.ahead * S)
        // 앞부분: 행성 근접 시점에서 궤도로 진입해 우주선 뒤 자리로(앞의 2D 행성 줌인에서 이어진다)
        if (f.t < INTRO_PRE_S) {
          const cx = (STATION_BOUNDS.minX + STATION_BOUNDS.maxX) / 2
          const cz = (STATION_BOUNDS.minZ + STATION_BOUNDS.maxZ) / 2
          if (home) introV.pp.set(home.position[0] - home.target[0], 0, home.position[2] - home.target[2]).normalize()
          else introV.pp.set(DEFAULT_VIEW_DIR[0], 0, DEFAULT_VIEW_DIR[1]).normalize()
          introV.pt.set(cx, PLANET.y + PLANET.r * PLANET_VIEW.look, cz).multiplyScalar(S)
          introV.pp
            .multiplyScalar(PLANET.r * PLANET_VIEW.dist * S)
            .add(new Vector3(cx * S, (PLANET.y + PLANET.r * (PLANET_VIEW.dist * 0.5 + PLANET_VIEW.rise)) * S, cz * S))
          const e = easeInOut(f.t / INTRO_PRE_S)
          introV.pos.lerpVectors(introV.pp, introV.pos, e)
          introV.tgt.lerpVectors(introV.pt, introV.tgt, e)
        }
        b = easeInOut((f.t - INTRO_BLEND_FROM) / (SHIP_INTRO_S - INTRO_BLEND_FROM))
      }
      if (home) {
        introV.home.set(...home.position)
        introV.homeT.set(...home.target)
        introV.pos.lerp(introV.home, b)
        introV.tgt.lerp(introV.homeT, b)
      }
      const fovGoal = INTRO_FOV + (introFov.current - INTRO_FOV) * b
      // 첫 프레임은 덮개 뒤라 바로 그 자리로, 그다음은 감쇠로 쫓는다
      const k = ic.init ? 1 - Math.exp(-INTRO_FOLLOW * Math.min(delta, 0.1)) : 1
      if (!ic.init) {
        ic.fov = fovGoal
        ic.init = true
      }
      ic.pos.lerp(introV.pos, k)
      ic.tgt.lerp(introV.tgt, k)
      ic.fov += (fovGoal - ic.fov) * k
      cam.fov = ic.fov
      cam.updateProjectionMatrix()
      camera.position.copy(ic.pos)
      c?.target.copy(ic.tgt)
      camera.lookAt(ic.tgt)
      // 우주선이 붙었고 카메라가 원래 시점에 거의 닿았으면(또는 너무 오래면) 끝 — 정확히 원래 시점에 맞추고 조작을 돌려준다
      const settled = f?.kind !== 'intro' && (ic.pos.distanceTo(introV.pos) < 0.02 || performance.now() > ic.settleUntil)
      if (f?.kind === 'intro' && pose.done) ic.settleUntil = performance.now() + 900
      if (settled && c) {
        camera.position.copy(introV.pos)
        c.target.copy(introV.tgt)
        cam.fov = introFov.current
        cam.updateProjectionMatrix()
        introFov.current = null
        ic.active = false
        cameraLock.intro = false
        c.enabled = true
        c.update()
      }
    }

    if (f && pose.done) {
      flight.current = null
      if (f.kind === 'depart' && f.dest) {
        // 다른 정거장으로 가면 장면은 그대로 두고 사무실만 바뀐다 — 우주선은 화면 밖에서 이어서 들어와 새 정거장에 붙는다.
        // 사무실 고르기 화면으로 가면 장면이 닫힌다
        if (f.dest.kind === 'workspace') flight.current = { kind: 'arrive', t: 0, dest: null }
        go(f.dest)
      }
    }
  })

  return (
    <>
    {/* 링과 해치를 잇는 연결 통로 — 정거장 쪽이라 우주선이 떠나도 남는다 */}
    <group scale={WORLD_SCALE}>
      <mesh position={[DOCK.x, HULL_Y, RING_FACE_Z + BRIDGE_LEN / 2]} rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.metal)} raycast={noRaycast}>
        <cylinderGeometry args={[0.7, 0.7, BRIDGE_LEN, 12]} />
      </mesh>
      <mesh position={[DOCK.x, HULL_Y, RING_FACE_Z + 0.35]} rotation={[Math.PI / 2, 0, 0]} material={lam(COLORS.frame)} raycast={noRaycast}>
        <cylinderGeometry args={[0.85, 0.85, 0.3, 12]} />
      </mesh>
    </group>
    <group ref={root}>
      <group ref={pitchG}>
      <group
        ref={spin}
        scale={WORLD_SCALE}
        rotation={[0, DOCKED_YAW, 0]}
        onPointerOver={(e) => {
          if (flight.current) return
          e.stopPropagation()
          setHovered(true)
          setCursor('pointer')
        }}
        onPointerOut={() => {
          setHovered(false)
          setCursor('')
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (flight.current || e.delta > clickSlop(e)) return
          setOpen((o) => !o)
        }}
      >
        <group ref={rollG}>
        <group position={[0, 0, -SHIP_MID]}>
        <ShipBody flames={flames} />
        {/* 누르기 쉬운 투명 판정 영역 */}
        <mesh position={[0, 0, 3.2]}>
          <boxGeometry args={[8, 3.4, 7.4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {hovered && !open && (
          <SceneHtml position={[0, 2.6, 3]} center zIndexRange={[0, 0]} pointerEvents="none">
            <div
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 2px 8px rgba(30,45,90,0.16)',
                font: '600 12px var(--font, sans-serif)',
                color: '#1b2333',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transform: 'translateY(-10px)',
              }}
            >
              다른 정거장으로
            </div>
          </SceneHtml>
        )}
        {open && (
          <SceneHtml position={[5.2, 0, 3]} zIndexRange={[20, 10]}>
            <DestinationList onPick={pick} onClose={() => setOpen(false)} />
          </SceneHtml>
        )}
        </group>
        </group>
      </group>
      </group>
    </group>
    </>
  )
}
