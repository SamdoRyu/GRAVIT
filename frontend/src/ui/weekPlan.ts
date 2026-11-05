// Weekly plan rules (FR-PLAN-02 · #39), pure — WeekView.tsx draws them. OWNER: C.
// Rows are the lead assignee (assigneeMemberIds[0] — CONTRACTS.md 「3」), columns the app due date (P14). No per-person sums.
import type { Id, Priority, TaskDto, Viewer, WorkspaceSnapshot } from '../data/types'
import { addDays } from './format'

/** Row of issues with no current lead (no assignee, or the lead left the team). Member ids never equal this. */
export const NO_LEAD_ROW = '__none__'
/** Column of open issues due before this week (shown on the current week only). */
export const LATE_COLUMN = 'late'
/** Saturday and Sunday share one column. */
export const WEEKEND_COLUMN = 'weekend'

const PRIORITY_ORDER: Record<Priority, number> = { high: 3, medium: 2, low: 1 }
const rank = (p: Priority | null) => (p === null ? 0 : PRIORITY_ORDER[p])

/** Who may set this issue's due date (P14): R2, or one of the issue's assignees. Instructors never. The server checks again. */
export function canEditDueDate(viewer: Viewer, task: TaskDto): boolean {
  if (viewer.role === 'repo_admin') return true
  return viewer.role === 'participant' && viewer.memberId !== null && task.assigneeMemberIds.includes(viewer.memberId)
}

export interface WeekCells {
  /** `${rowId}|${columnId}` → open issues, priority first then issue number. Column id = the date, LATE_COLUMN or WEEKEND_COLUMN. */
  cells: Map<string, TaskDto[]>
  /** Open issues with no due date, in Snapshot order */
  noDue: TaskDto[]
}

/**
 * Places every open issue with a due date into its row × column for the week starting `weekStart` (a Monday,
 * "YYYY-MM-DD"). Issues due before the week go to LATE_COLUMN only when `showLate` (the current week); others outside the
 * week are left out. Closed issues and PRs are not on the board.
 */
export function weekCells(snapshot: Pick<WorkspaceSnapshot, 'members' | 'tasks'>, weekStart: string, showLate: boolean): WeekCells {
  const cells = new Map<string, TaskDto[]>()
  const noDue: TaskDto[] = []
  const current = new Set<Id>(snapshot.members.filter((m) => m.removedAt === null).map((m) => m.id))
  const lastWeekday = addDays(weekStart, 4)
  const sat = addDays(weekStart, 5)
  const sun = addDays(weekStart, 6)
  for (const t of snapshot.tasks) {
    if (t.state !== 'open') continue
    if (t.dueDate === null) {
      noDue.push(t)
      continue
    }
    let col: string | null = null
    if (t.dueDate < weekStart) col = showLate ? LATE_COLUMN : null
    else if (t.dueDate <= lastWeekday) col = t.dueDate
    else if (t.dueDate === sat || t.dueDate === sun) col = WEEKEND_COLUMN
    if (col === null) continue
    const lead = t.assigneeMemberIds[0]
    const row = lead !== undefined && current.has(lead) ? lead : NO_LEAD_ROW
    const key = `${row}|${col}`
    const list = cells.get(key)
    if (list) list.push(t)
    else cells.set(key, [t])
  }
  for (const list of cells.values()) list.sort((a, b) => rank(b.priority) - rank(a.priority) || a.githubIssueNumber - b.githubIssueNumber)
  return { cells, noDue }
}
