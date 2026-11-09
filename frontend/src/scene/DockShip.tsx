// 도킹 베이 끝에 붙어 있는 우주선 — 사무실 바꾸기 (팀 결정 2026-11-09, #267). 처음 쓰는 사람을 위해 상단 바 더보기의 "사무실 바꾸기"도 그대로 둔다.
// 우주선은 도킹 링 앞에 가로로 누워 동체 옆 해치가 짧은 연결 통로로 링에 이어져 있다. 누르면 갈 수 있는 다른 정거장(들어갈 수
// 있는 다른 사무실) 목록이 뜨고, 고르면 우주선이 통로에서 떨어져 기수 쪽 화면 밖으로 날아간 뒤 그 사무실이 열린다. 새 정거장(같은
// 모델)에서는 우주선이 기수를 진행 방향으로 두고 화면 밖에서 들어와 멈춘 뒤, 세로로 반 바퀴 돌아(반 롤로 바로 서며) 기수를 서쪽으로
// 맞추고 통로에 붙는다(scene/shipFlight.ts). "정거장 목록 화면으로"는 사무실 고르기
// 화면(새 레포의 사무실 열기도 거기 있다)으로 간다. 움직임 줄이기 설정이면 비행 없이 바로 옮긴다.
// 우주선은 시안 팔레트의 기본 도형으로 만든다(새 glTF 없음).
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { AdditiveBlending, MeshBasicMaterial, type Group } from 'three'
import type { Id, WorkspaceListItem } from '../data/types'
import { useSession } from '../session'
import { useOffice } from '../store'
import { COLORS, lam } from '../theme/station/parts'
import { DOCK, HULL_Y, WORLD_SCALE } from '../theme/station/geometry'
import { clickSlop, noRaycast, setCursor, shipLive } from './runtime'
import { SceneHtml } from './shared'
import { shipPose, type ShipFlight } from './shipFlight'

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
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    shipLive.flight = null
    return () => {
      shipLive.flight = null
      setCursor('')
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

  useFrame((_, delta) => {
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
