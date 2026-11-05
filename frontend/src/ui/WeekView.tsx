// Weekly plan (FR-PLAN-02): member x weekday grid of open tasks by due date. OWNER: ui-builder.
// Read-only board (#39): no points, no per-person workload, no drag. A drag here would also change the assignee, which is a
// GitHub change the app never makes (CON-02); the due date is edited from the task detail (P14 — R2 or the task's assignees).
import { memo, useMemo } from 'react'
import type { Id, Member, Task } from '../data/types'
import { PRIORITY_META } from '../data/meta'
import { isOpen, taskKey, todayIso } from '../data/selectors'
import { useOffice } from '../store'
import { Avatar, Empty, PriorityDot } from './common'
import { addDays, formatMonthDay, mondayOf, parseIso } from './format'
import { useMemberList, useNow } from './hooks'
import { Icon } from './icons'
import { useUi } from './uiState'

const DAY_NAMES = ['월', '화', '수', '목', '금']
/** Row id of the unassigned row (member ids never equal this). */
const NONE = '__none__'

interface Col {
  id: string
  label: string
  sub?: string
  kind: 'late' | 'day' | 'weekend'
  today?: boolean
}

function weekLabel(offset: number) {
  if (offset === 0) return '이번 주'
  if (offset === -1) return '지난주'
  if (offset === 1) return '다음 주'
  return offset < 0 ? `${-offset}주 전` : `${offset}주 뒤`
}

const Chip = memo(function Chip({ taskId, overdue }: { taskId: Id; overdue: boolean }) {
  const task = useOffice((s) => s.tasks[taskId])
  const projectKey = useOffice((s) => s.projects[s.tasks[taskId]?.projectId ?? '']?.key)
  const hovered = useOffice((s) => s.hover?.kind === 'task' && s.hover.id === taskId)
  const selected = useOffice((s) => s.selection?.kind === 'task' && s.selection.id === taskId)
  if (!task) return null
  const select = () => useOffice.getState().select({ kind: 'task', id: taskId })
  return (
    <div
      role="button"
      tabIndex={0}
      className={`wk-chip${hovered ? ' is-hover' : ''}${selected ? ' is-selected' : ''}${overdue ? ' is-overdue' : ''}`}
      title={`${taskKey(task, projectKey)} · ${task.title}`}
      onPointerEnter={() => useOffice.getState().setHover({ kind: 'task', id: taskId })}
      onPointerLeave={() => useOffice.getState().setHover(null)}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      }}
    >
      <div className="wk-chip-top">
        <PriorityDot priority={task.priority} />
        <span className="wk-key">{taskKey(task, projectKey)}</span>
      </div>
      <div className="wk-chip-title">{task.title}</div>
    </div>
  )
})

const Cell = memo(function Cell({ col, tasks, today }: { col: Col; tasks: Task[]; today: string }) {
  return (
    <div className={`wk-cell wk-${col.kind}${col.today ? ' is-today' : ''}`}>
      {tasks.map((t) => (
        <Chip key={t.id} taskId={t.id} overdue={t.dueDate !== null && t.dueDate < today} />
      ))}
    </div>
  )
})

/** Who the row is for — name only. No points, capacity or workload bar: nothing per person to compare (P6 · NFR-06). */
function RowLabel({ member }: { member: Member | null }) {
  if (!member) {
    return (
      <div className="wk-label">
        <div className="wk-who">
          <Avatar size={20} />
          <span className="wk-name">미배정</span>
        </div>
      </div>
    )
  }
  const select = () => useOffice.getState().select({ kind: 'member', id: member.id })
  return (
    <div
      className="wk-label is-member"
      role="button"
      tabIndex={0}
      title={member.name}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      }}
      onPointerEnter={() => useOffice.getState().setHover({ kind: 'member', id: member.id })}
      onPointerLeave={() => useOffice.getState().setHover(null)}
    >
      <div className="wk-who">
        <Avatar member={member} size={20} />
        <span className="wk-name">{member.name}</span>
      </div>
    </div>
  )
}

export function WeekView() {
  const tasks = useOffice((s) => s.tasks)
  const members = useMemberList()
  const offset = useUi((s) => s.weekOffset)
  // Re-render each minute so the view rolls over at midnight.
  const nowMs = useNow(60_000)
  const today = todayIso(new Date(nowMs))

  const weekStart = useMemo(() => mondayOf(addDays(today, offset * 7)), [offset, today])

  const cols = useMemo<Col[]>(() => {
    const t = today
    const out: Col[] = []
    if (offset === 0) out.push({ id: 'late', label: '지연', kind: 'late' })
    for (let i = 0; i < 5; i++) {
      const date = addDays(weekStart, i)
      out.push({ id: date, label: DAY_NAMES[i], sub: String(parseIso(date).getDate()), kind: 'day', today: date === t })
    }
    const sat = addDays(weekStart, 5)
    out.push({ id: 'weekend', label: '주말', kind: 'weekend', today: sat === t || addDays(weekStart, 6) === t })
    return out
  }, [weekStart, offset, today])

  const { cells, noDue } = useMemo(() => {
    const cells = new Map<string, Task[]>()
    let noDue = 0
    const memberIds = new Set(members.map((m) => m.id))
    const sun = addDays(weekStart, 6)
    const lastWeekday = addDays(weekStart, 4)
    const sat = addDays(weekStart, 5)
    for (const t of Object.values(tasks)) {
      if (!isOpen(t)) continue
      if (!t.dueDate) {
        noDue++
        continue
      }
      let col: string | null = null
      if (t.dueDate < weekStart) col = offset === 0 ? 'late' : null
      else if (t.dueDate <= lastWeekday) col = t.dueDate
      else if (t.dueDate === sat || t.dueDate === sun) col = 'weekend'
      if (col === null) continue
      const row = t.assigneeId && memberIds.has(t.assigneeId) ? t.assigneeId : NONE
      const key = `${row}|${col}`
      const list = cells.get(key)
      if (list) list.push(t)
      else cells.set(key, [t])
    }
    for (const list of cells.values()) {
      list.sort((a, b) => PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight || a.number - b.number)
    }
    return { cells, noDue }
  }, [tasks, members, weekStart, offset])

  const rangeText = `${formatMonthDay(weekStart)} – ${formatMonthDay(addDays(weekStart, 4))}`
  const anyChip = cells.size > 0
  const setOffset = (n: number) => useUi.getState().setWeekOffset(n)

  const renderRow = (rowId: string, member: Member | null) => (
    <div className="wk-row" key={rowId}>
      <RowLabel member={member} />
      {cols.map((c) => (
        <Cell key={c.id} col={c} tasks={cells.get(`${rowId}|${c.id}`) ?? EMPTY} today={today} />
      ))}
    </div>
  )

  return (
    <div className="wk">
      <div className="wk-bar">
        <button type="button" className="btn btn-icon btn-sm btn-ghost" aria-label="이전 주" title="이전 주" onClick={() => setOffset(offset - 1)}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <button type="button" className="btn btn-sm wk-now" onClick={() => setOffset(0)} disabled={offset === 0} title="이번 주로 돌아가기">
          {weekLabel(offset)}
        </button>
        <button type="button" className="btn btn-icon btn-sm btn-ghost" aria-label="다음 주" title="다음 주" onClick={() => setOffset(offset + 1)}>
          <Icon name="chevronRight" size={16} />
        </button>
        <span className="wk-range">{rangeText}</span>
      </div>

      <div className="wk-scroll">
        <div className="wk-head">
          <span className="wk-corner" />
          {cols.map((c) => (
            <span key={c.id} className={`wk-h wk-h-${c.kind}${c.today ? ' is-today' : ''}`} title={c.kind === 'weekend' ? '토요일 · 일요일 마감' : undefined}>
              {c.label}
              {c.sub && <b>{c.sub}</b>}
            </span>
          ))}
        </div>
        {renderRow(NONE, null)}
        {members.map((m) => renderRow(m.id, m))}
        {members.length === 0 && <Empty icon="users" title="아직 팀원이 없어요" hint="팀원을 추가하면 주간 계획에 행이 생겨요." />}
      </div>

      <footer className="wk-foot">
        <span>마감 없는 작업 {noDue}개</span>
        <span className="dim">{anyChip ? '마감일은 작업 상세에서 바꿀 수 있어요' : '이 주에는 마감이 잡힌 작업이 없어요'}</span>
      </footer>
    </div>
  )
}

const EMPTY: Task[] = []
