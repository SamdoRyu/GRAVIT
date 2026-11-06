// Weekly plan (FR-PLAN-02 · #39): member × weekday board of the open v1 office's open issues by their app due date. OWNER: C.
// A chip sits in its lead assignee's row (assigneeMemberIds[0] — CONTRACTS.md 「3」) on its due date. No points, no
// per-person totals or workload (P6 · NFR-06), no drag: the assignee is a GitHub value the app never changes (CON-02).
// The due date is the app's own (P14): repo admins (R2) and the issue's assignees set or clear it for the selected issue;
// the GitHub issue does not change.
import { memo, useMemo, useState } from 'react'
import { dueDateError } from '../data/rules/meeting'
import { todayIso } from '../data/selectors'
import type { Id, MemberDto, TaskDto, Viewer } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { addDays, formatMonthDay, mondayOf, parseIso } from './format'
import { useNow } from './hooks'
import { Icon } from './icons'
import { MemberAvatar, NoMemberAvatar, PriorityMark } from './officeParts'
import { useUi } from './uiState'
import { canEditDueDate, LATE_COLUMN, NO_LEAD_ROW, weekCells, WEEKEND_COLUMN } from './weekPlan'

const DAY_NAMES = ['월', '화', '수', '목', '금']
const EMPTY: TaskDto[] = []

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

/** Hover key shared with the 3D box of the same issue (SceneModel key). */
const hoverKey = (taskId: Id) => `task:${taskId}`

const Chip = memo(function Chip({ task, overdue }: { task: TaskDto; overdue: boolean }) {
  const hovered = useOffice((s) => s.hover === hoverKey(task.id))
  const selected = useOffice((s) => s.officeSelection?.kind === 'task' && s.officeSelection.id === task.id)
  const select = () => useOffice.getState().selectInOffice({ kind: 'task', id: task.id })
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`이슈 #${task.githubIssueNumber} ${task.title}`}
      aria-current={selected ? 'true' : undefined}
      className={`wk-chip${hovered ? ' is-hover' : ''}${selected ? ' is-selected' : ''}${overdue ? ' is-overdue' : ''}`}
      title={`#${task.githubIssueNumber} · ${task.title}`}
      onPointerEnter={() => useOffice.getState().setHover(hoverKey(task.id))}
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
        <PriorityMark priority={task.priority} />
        <span className="wk-key">#{task.githubIssueNumber}</span>
      </div>
      <div className="wk-chip-title">{task.title}</div>
    </div>
  )
})

const Cell = memo(function Cell({ col, tasks, today }: { col: Col; tasks: TaskDto[]; today: string }) {
  return (
    <div className={`wk-cell wk-${col.kind}${col.today ? ' is-today' : ''}`}>
      {tasks.map((t) => (
        <Chip key={t.id} task={t} overdue={t.dueDate !== null && t.dueDate < today} />
      ))}
    </div>
  )
})

/** Who the row is for — name only. No points, capacity or workload: nothing per person to compare (P6 · NFR-06). */
function RowLabel({ member }: { member: MemberDto | null }) {
  if (!member) {
    return (
      <div className="wk-label" title="담당자가 없거나, 대표 담당자가 지금 팀원이 아닌 이슈">
        <div className="wk-who">
          <NoMemberAvatar />
          <span className="wk-name">미배정</span>
        </div>
      </div>
    )
  }
  const select = () => useOffice.getState().selectInOffice({ kind: 'member', id: member.id })
  return (
    <div
      className="wk-label is-member"
      role="button"
      tabIndex={0}
      title={member.displayName}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      }}
    >
      <div className="wk-who">
        <MemberAvatar member={member} />
        <span className="wk-name">{member.displayName}</span>
      </div>
    </div>
  )
}

/** Due date of the selected open issue: edit (R2 · assignees) or a note on who can. */
function DueDateBar({ task, viewer }: { task: TaskDto; viewer: Viewer }) {
  // The caller keys this by issue and saved date, so the input starts again from the saved value.
  const [value, setValue] = useState(task.dueDate ?? '')
  const [busy, setBusy] = useState(false)
  const editable = canEditDueDate(viewer, task)
  const error = value === '' ? null : dueDateError(value)
  const changed = value !== (task.dueDate ?? '')

  const run = async (save: () => Promise<boolean>) => {
    setBusy(true)
    try {
      await save()
    } finally {
      setBusy(false)
    }
  }
  const st = useOffice.getState()
  return (
    <section className="wk-due" aria-label={`이슈 #${task.githubIssueNumber} 마감`}>
      <div className="wk-due-head">
        <span className="wk-key">#{task.githubIssueNumber}</span>
        <span className="wk-due-title">{task.title}</span>
      </div>
      {editable ? (
        <form
          className="wk-due-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!changed || error || busy) return
            void run(() => (value === '' ? st.clearTaskDueDate(task.id) : st.setTaskDueDate(task.id, value)))
          }}
        >
          <label>
            마감
            <input className="select" type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? 'true' : undefined} disabled={busy} />
          </label>
          <button type="submit" className="btn btn-sm btn-primary" disabled={!changed || !!error || busy}>
            저장
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={task.dueDate === null || busy} onClick={() => void run(() => st.clearTaskDueDate(task.id))}>
            마감 지우기
          </button>
          {error && <span className="wk-due-error" role="alert">{error}</span>}
          <span className="dim wk-due-note">앱에만 저장돼요 · GitHub 이슈는 바뀌지 않아요</span>
        </form>
      ) : (
        <p className="dim wk-due-note">
          마감 {task.dueDate ? formatMonthDay(task.dueDate) : '없음'} · 레포 관리자와 이 이슈 담당자만 바꿀 수 있어요
        </p>
      )}
    </section>
  )
}

export function WeekView() {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const status = useOffice((s) => s.office?.status ?? null)
  const selection = useOffice((s) => s.officeSelection)
  const offset = useUi((s) => s.weekOffset)
  const [showNoDue, setShowNoDue] = useState(false)
  // Re-render each minute so the view rolls over at midnight.
  const nowMs = useNow(60_000)
  const today = todayIso(new Date(nowMs))

  const weekStart = useMemo(() => mondayOf(addDays(today, offset * 7)), [offset, today])

  const cols = useMemo<Col[]>(() => {
    const out: Col[] = []
    if (offset === 0) out.push({ id: LATE_COLUMN, label: '지연', kind: 'late' })
    for (let i = 0; i < 5; i++) {
      const date = addDays(weekStart, i)
      out.push({ id: date, label: DAY_NAMES[i], sub: String(parseIso(date).getDate()), kind: 'day', today: date === today })
    }
    const sat = addDays(weekStart, 5)
    out.push({ id: WEEKEND_COLUMN, label: '주말', kind: 'weekend', today: sat === today || addDays(weekStart, 6) === today })
    return out
  }, [weekStart, offset, today])

  /** Current members, in Snapshot order (desk order). */
  const members = useMemo(() => (snapshot?.members ?? []).filter((m) => m.removedAt === null), [snapshot])

  const { cells, noDue } = useMemo(() => (snapshot ? weekCells(snapshot, weekStart, offset === 0) : { cells: new Map<string, TaskDto[]>(), noDue: [] }), [snapshot, weekStart, offset])

  const selectedTask = selection?.kind === 'task' ? snapshot?.tasks.find((t) => t.id === selection.id && t.state === 'open') : undefined

  if (!snapshot) {
    return (
      <div className="wk">
        <Empty icon="calendar" title={status === 'error' ? '사무실을 읽지 못했어요' : status === null ? '열린 사무실이 없어요' : '사무실을 여는 중이에요'} />
      </div>
    )
  }

  const rangeText = `${formatMonthDay(weekStart)} – ${formatMonthDay(addDays(weekStart, 4))}`
  const anyChip = cells.size > 0
  const setOffset = (n: number) => useUi.getState().setWeekOffset(n)

  const renderRow = (rowId: string, member: MemberDto | null) => (
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
        {renderRow(NO_LEAD_ROW, null)}
        {members.map((m) => renderRow(m.id, m))}
        {members.length === 0 && <Empty icon="users" title="아직 팀원이 없어요" hint="레포 콜라보레이터가 동기화되면 행이 생겨요." />}
      </div>

      {selectedTask && <DueDateBar key={`${selectedTask.id}|${selectedTask.dueDate ?? ''}`} task={selectedTask} viewer={snapshot.viewer} />}

      {showNoDue && noDue.length > 0 && (
        <ul className="wk-nodue" aria-label="마감 없는 열린 이슈">
          {noDue.map((t) => (
            <li key={t.id}>
              <Chip task={t} overdue={false} />
            </li>
          ))}
        </ul>
      )}

      <footer className="wk-foot">
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={showNoDue} disabled={noDue.length === 0} onClick={() => setShowNoDue(!showNoDue)}>
          마감 없는 이슈 {noDue.length}개
        </button>
        <span className="dim">{anyChip ? '이슈를 누르면 상세와 마감을 볼 수 있어요' : '이 주에는 마감이 잡힌 이슈가 없어요'}</span>
      </footer>
    </div>
  )
}
