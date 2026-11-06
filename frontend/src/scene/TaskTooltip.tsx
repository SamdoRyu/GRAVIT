// A small label that follows the hovered issue / PR box of the v1 office: number, state, title. For an agenda shape on the
// bridge table: "안건 · <source>" and the agenda title.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useOffice } from '../store'
import { AGENDA_KIND_LABEL } from '../ui/meetingView'
import { boxLive } from './runtime'
import { SceneHtml } from './shared'

const PR_STATE = { open: '열림', draft: 'Draft', merged: '머지됨', closed: '미병합 종료' } as const
const ISSUE_STATE = { open: '열림', closed: '닫힘' } as const

/** "#12 · 열림" and the title of the hovered box (hover id = SceneModel key, 'task:<id>' · 'submission:<id>' · 'agenda:<id>') */
function useHovered(): { key: string; head: string; title: string } | null {
  const key = useOffice((s) => (s.hover?.kind === 'task' ? s.hover.id : null))
  const head = useOffice((s) => {
    const snap = s.office?.snapshot
    if (!key || !snap) return null
    const [kind, id] = key.split(':')
    if (kind === 'agenda') {
      const a = snap.agendaItems.find((x) => x.id === id)
      if (!a) return null
      const t = a.source?.type === 'task' ? snap.tasks.find((x) => x.id === a.source!.id) : undefined
      const p = a.source?.type === 'submission' ? snap.submissions.find((x) => x.id === a.source!.id) : undefined
      // learning · other items have no source: name the kind instead (#31)
      const of = t ? `이슈 #${t.githubIssueNumber}` : p ? `PR #${p.githubPrNumber}` : AGENDA_KIND_LABEL[a.kind]
      return `안건|${of}|${a.title}`
    }
    if (kind === 'task') {
      const t = snap.tasks.find((x) => x.id === id)
      return t ? `${t.githubIssueNumber}|${ISSUE_STATE[t.state]}|${t.title}` : null
    }
    const p = kind === 'submission' ? snap.submissions.find((x) => x.id === id) : undefined
    return p ? `${p.githubPrNumber}|PR · ${PR_STATE[p.state]}|${p.title}` : null
  })
  if (!key || !head) return null
  const [n, state, ...title] = head.split('|')
  return { key, head: n === '안건' ? `안건 · ${state}` : `#${n} · ${state}`, title: title.join('|') }
}

export function TaskTooltip() {
  const hovered = useHovered()
  const ref = useRef<Group>(null)

  useFrame(() => {
    const g = ref.current
    if (!g || !hovered) return
    const b = boxLive.get(hovered.key)
    if (b) g.position.set(b.x, b.y + 0.85, b.z)
  })

  if (!hovered) return null
  return (
    <group ref={ref}>
      <SceneHtml center zIndexRange={[0, 0]} pointerEvents="none">
        <div
          style={{
            background: 'rgba(255,255,255,0.97)',
            borderRadius: 10,
            padding: '5px 10px',
            boxShadow: '0 4px 14px rgba(30,45,90,0.25)',
            font: '600 12px var(--font, sans-serif)',
            color: '#1b2333',
            maxWidth: 240,
            transform: 'translateY(-14px)',
            userSelect: 'none',
          }}
        >
          <div style={{ color: '#6b7487', fontWeight: 700, whiteSpace: 'nowrap' }}>{hovered.head}</div>
          <div style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hovered.title}</div>
        </div>
      </SceneHtml>
    </group>
  )
}
