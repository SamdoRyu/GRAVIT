// Confirmed activity notes (#173 — FR-ACT-03) as flat memos on a console desk: the author's pod console, or the comm hub
// console when the author has no pod (SceneModel desk · board). A memo shows the activity kind as a coloured sheet with an
// icon — never the time or the content (CONTRACTS_API.md 「5」 ActivityNote). The newest MEMOS_PER_CONSOLE per desk are shown;
// the rest are counted in a "+N" tag. No totals or per-person numbers anywhere (P6).
import { memo, useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CanvasTexture, Color, MeshStandardMaterial, NoColorSpace, type Group } from 'three'
import type { ActivityKind, ActivityNote } from '../data/types'
import { useOffice } from '../store'
import { COMM_CONSOLE, MEMOS_PER_CONSOLE, memoSpot, podConsole, type ConsoleAt, type MemoSpot } from '../theme/station/memoSpots'
import { WORLD_SCALE } from '../theme/station/geometry'
import { boxLive, setCursor, type BoxLive } from './runtime'
import { SceneHtml, useDynamicLayer } from './shared'
import { useStationScene } from './useStationScene'

/** Sheet colour per kind (pastel paper) — the icon says the kind, the colour helps tell them apart at a glance */
const PAPER: Record<ActivityKind, string> = {
  planning: '#ffe08a',
  research: '#bfe3ff',
  design: '#ffc9e0',
  presentation: '#c9f2d8',
  mentor_question: '#e2d4ff',
}
const INK = '#232a5c'

/** Memo size in station units (a sticky note on the 2.2-wide console top) */
const SHEET = { w: 0.42, h: 0.03, d: 0.36 } as const
const GEOMETRY = new BoxGeometry(SHEET.w * WORLD_SCALE, SHEET.h * WORLD_SCALE, SHEET.d * WORLD_SCALE)

/** The kind icon drawn on a 128 px canvas (simple line glyphs in the design's navy). */
function drawIcon(g: CanvasRenderingContext2D, kind: ActivityKind) {
  g.strokeStyle = INK
  g.fillStyle = INK
  g.lineWidth = 9
  g.lineCap = 'round'
  g.lineJoin = 'round'
  switch (kind) {
    case 'planning': // a checklist
      for (let i = 0; i < 3; i++) {
        const y = 38 + i * 26
        g.beginPath()
        g.moveTo(30, y)
        g.lineTo(37, y + 7)
        g.lineTo(48, y - 6)
        g.moveTo(60, y)
        g.lineTo(100, y)
        g.stroke()
      }
      break
    case 'research': // a magnifier
      g.beginPath()
      g.arc(56, 56, 24, 0, Math.PI * 2)
      g.moveTo(74, 74)
      g.lineTo(98, 98)
      g.stroke()
      break
    case 'design': // a pencil
      g.beginPath()
      g.moveTo(36, 92)
      g.lineTo(44, 70)
      g.lineTo(84, 30)
      g.lineTo(98, 44)
      g.lineTo(58, 84)
      g.closePath()
      g.stroke()
      g.beginPath()
      g.moveTo(44, 70)
      g.lineTo(58, 84)
      g.stroke()
      break
    case 'presentation': // a board on an easel
      g.strokeRect(28, 28, 72, 48)
      g.beginPath()
      g.moveTo(64, 76)
      g.lineTo(64, 100)
      g.moveTo(48, 104)
      g.lineTo(64, 84)
      g.lineTo(80, 104)
      g.stroke()
      break
    case 'mentor_question': // a question mark
      g.font = '700 84px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('?', 64, 70)
      break
  }
}

const topTextures = new Map<ActivityKind, CanvasTexture>()
/** One texture per kind, shared by every memo (made once, on first use). */
function topTexture(kind: ActivityKind): CanvasTexture {
  let t = topTextures.get(kind)
  if (!t) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const g = canvas.getContext('2d')!
    g.fillStyle = PAPER[kind]
    g.fillRect(0, 0, 128, 128)
    drawIcon(g, kind)
    t = new CanvasTexture(canvas)
    t.colorSpace = NoColorSpace // the canvas renders linear (SceneCanvas `linear`)
    t.anisotropy = 4
    topTextures.set(kind, t)
  }
  return t
}

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const Memo = memo(function Memo({ id, kind, spot }: { id: string; kind: ActivityKind; spot: MemoSpot }) {
  const key = `activity:${id}`
  const hovered = useOffice((s) => s.hover === key)
  const materials = useMemo(() => {
    const side = new MeshStandardMaterial({ color: new Color(PAPER[kind]), roughness: 0.8 })
    const top = new MeshStandardMaterial({ map: topTexture(kind), roughness: 0.8 })
    // BoxGeometry faces: +x, -x, +y (top), -y, +z, -z
    return { list: [side, side, top, side, side, side], side, top }
  }, [kind])
  useEffect(
    () => () => {
      materials.side.dispose()
      materials.top.dispose()
    },
    [materials],
  )
  useEffect(() => {
    materials.side.emissive.set(hovered ? '#3a4a8a' : '#000000')
    materials.top.emissive.set(hovered ? '#3a4a8a' : '#000000')
  }, [materials, hovered])

  const group = useRef<Group>(null)
  useDynamicLayer(group)
  useEffect(() => {
    const live: BoxLive = { x: spot.x, y: spot.y, z: spot.z }
    boxLive.set(key, live)
    return () => {
      if (boxLive.get(key) === live) boxLive.delete(key)
      const s = useOffice.getState()
      if (s.hover === key) s.setHover(null)
    }
  }, [key, spot])

  const lift = hovered ? 0.02 : 0
  return (
    <group
      ref={group}
      position={[spot.x, spot.y + (SHEET.h * WORLD_SCALE) / 2 + lift, spot.z]}
      rotation={[0, spot.ry, 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        useOffice.getState().setHover(key)
        setCursor('default')
      }}
      onPointerOut={() => {
        const s = useOffice.getState()
        if (s.hover === key) s.setHover(null)
      }}
    >
      <mesh geometry={GEOMETRY} material={materials.list} castShadow receiveShadow />
    </group>
  )
})

/** "+N" above a console holding more memos than it shows */
function MoreTag({ console: c, count }: { console: ConsoleAt; count: number }) {
  const top = memoSpot(c, MEMOS_PER_CONSOLE - 1)
  return (
    <SceneHtml position={[top.x, top.y + 0.18, top.z]} center zIndexRange={[0, 0]} pointerEvents="none">
      <div
        style={{
          padding: '1px 6px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 2px 8px rgba(30,45,90,0.16)',
          font: '600 10px var(--font, sans-serif)',
          color: '#1b2333',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        메모 +{count}
      </div>
    </SceneHtml>
  )
}

export function ActivityNotes() {
  const scene = useStationScene()
  const notes = useOffice((s) => s.office?.snapshot?.activityNotes ?? null)

  /** desk key ('desk:<id>' · 'board') → its console, its notes (newest first) and the spots of the ones shown */
  const desks = useMemo(() => {
    const out = new Map<string, { console: ConsoleAt; notes: ActivityNote[]; spots: MemoSpot[] }>()
    if (!scene || !notes) return out
    const byId = new Map(notes.map((n) => [n.id, n]))
    for (const e of scene.entities) {
      if (e.kind !== 'activity' || e.refId === null) continue
      const note = byId.get(e.refId)
      if (!note) continue
      const role = e.placeRole
      const c = role === 'board' ? COMM_CONSOLE : role.startsWith('desk:') ? podConsole(scene.seats.get(role.slice('desk:'.length)) ?? -1) : null
      if (!c) continue
      const desk = out.get(role) ?? { console: c, notes: [], spots: [] }
      desk.notes.push(note)
      out.set(role, desk)
    }
    for (const d of out.values()) {
      d.notes.sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : a.confirmedAt > b.confirmedAt ? -1 : a.id < b.id ? -1 : 1))
      d.spots = d.notes.slice(0, MEMOS_PER_CONSOLE).map((n, i) => memoSpot(d.console, i, (hash01(n.id) - 0.5) * 0.35))
    }
    return out
  }, [scene, notes])

  return (
    <>
      {[...desks].map(([role, d]) => (
        <group key={role}>
          {d.spots.map((spot, i) => (
            <Memo key={d.notes[i].id} id={d.notes[i].id} kind={d.notes[i].kind} spot={spot} />
          ))}
          {d.notes.length > MEMOS_PER_CONSOLE && <MoreTag console={d.console} count={d.notes.length - MEMOS_PER_CONSOLE} />}
        </group>
      ))}
    </>
  )
}
