// 관리 패널 칸반 · 목록의 v1 항목 (#102 T5-c-2). 순수 함수 — 화면 · 테스트가 같이 쓴다. 소유: D.
// 이슈 · PR은 GitHub 원본이라 읽기 전용이다 — 상태 · 담당 편집은 없다(2026-10-28 결정, SCREEN_ASSIGNMENTS).
// 열은 CONTRACTS.md 「3」 표시 상태: 대기 · 작업 중 · 검토 · 완료(종료 포함).
import type { Id, LocalDate, MemberDto, Priority, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../types'

export type BoardColumn = 'waiting' | 'working' | 'review' | 'done'

export const BOARD_COLUMNS: readonly BoardColumn[] = ['waiting', 'working', 'review', 'done']

export const BOARD_COLUMN_META: Record<BoardColumn, { label: string; color: string; hint: string }> = {
  waiting: { label: '대기', color: '#8a94a8', hint: '열린 이슈 · 담당자 없음' },
  working: { label: '작업 중', color: '#3a6df0', hint: '열린 이슈 · 담당자 있음' },
  review: { label: '검토', color: '#9b5de5', hint: '열린 PR(Draft 포함)' },
  done: { label: '완료', color: '#22b07d', hint: '닫힌 이슈 · 머지되거나 닫힌 PR' },
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' }
export const PRIORITY_COLOR: Record<Priority, string> = { high: '#f08a24', medium: '#e8c33a', low: '#9fb0c8' }
export const KIND_LABEL: Record<'task' | 'submission', string> = { task: '이슈', submission: 'PR' }
const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 }

/** 이슈의 표시 상태: 닫힘 → 완료, 열림 · 팀원 담당자 있음 → 작업 중, 없음 → 대기 */
export function taskColumn(t: Pick<TaskDto, 'state' | 'assigneeMemberIds'>): BoardColumn {
  if (t.state === 'closed') return 'done'
  return t.assigneeMemberIds.length > 0 ? 'working' : 'waiting'
}

/** PR의 표시 상태: 열림 · Draft → 검토, 머지 · 닫힘 → 완료 */
export function submissionColumn(s: Pick<SubmissionDto, 'state'>): BoardColumn {
  return s.state === 'open' || s.state === 'draft' ? 'review' : 'done'
}

/** 카드 옆 표시 — 막힘(서버 계산), Draft, 머지 안 되고 닫힘, 계획 안 함으로 닫힘 */
export type BoardFlag = 'blocked' | 'draft' | 'unmerged_closed' | 'not_planned'

export const BOARD_FLAG_LABEL: Record<BoardFlag, string> = {
  blocked: '막힘',
  draft: 'Draft',
  unmerged_closed: '미병합 종료',
  not_planned: '계획 안 함',
}

export interface BoardItem {
  /** 화면 키 — 이슈 · PR ID가 겹쳐도 다르게 */
  key: string
  kind: 'task' | 'submission'
  id: Id
  /** GitHub 이슈 · PR 번호 */
  number: number
  title: string
  column: BoardColumn
  priority: Priority | null
  /** 이슈만 — 앱 저장 마감 */
  dueDate: LocalDate | null
  /** 이슈: 담당자 전원(첫 번째가 대표), PR: 작성자(팀원일 때) */
  memberIds: Id[]
  labels: string[]
  flags: BoardFlag[]
  /** GitHub 화면. 시연은 null */
  htmlUrl: string | null
  /** 같은 번호일 때 이슈를 먼저 */
  order: number
}

export function taskItem(t: TaskDto): BoardItem {
  const flags: BoardFlag[] = []
  if (t.isBlocked) flags.push('blocked')
  if (t.state === 'closed' && t.closedReason === 'not_planned') flags.push('not_planned')
  return {
    key: `task:${t.id}`,
    kind: 'task',
    id: t.id,
    number: t.githubIssueNumber,
    title: t.title,
    column: taskColumn(t),
    priority: t.priority,
    dueDate: t.dueDate,
    memberIds: t.assigneeMemberIds,
    labels: t.labels,
    flags,
    htmlUrl: t.htmlUrl,
    order: 0,
  }
}

export function submissionItem(s: SubmissionDto): BoardItem {
  const flags: BoardFlag[] = []
  if (s.isBlocked) flags.push('blocked')
  if (s.state === 'draft') flags.push('draft')
  if (s.state === 'closed') flags.push('unmerged_closed')
  return {
    key: `submission:${s.id}`,
    kind: 'submission',
    id: s.id,
    number: s.githubPrNumber,
    title: s.title,
    column: submissionColumn(s),
    priority: s.priority,
    dueDate: null,
    memberIds: s.authorMemberId === null ? [] : [s.authorMemberId],
    labels: s.labels,
    flags,
    htmlUrl: s.htmlUrl,
    order: 1,
  }
}

/** Snapshot의 이슈 · PR 전부 — 번호 순 */
export function boardItems(snapshot: Pick<WorkspaceSnapshot, 'tasks' | 'submissions'>): BoardItem[] {
  return [...snapshot.tasks.map(taskItem), ...snapshot.submissions.map(submissionItem)].sort(byNumber)
}

const byNumber = (a: BoardItem, b: BoardItem) => a.number - b.number || a.order - b.order

/**
 * 검색 — 공백으로 나눈 낱말이 모두 맞아야 한다. 제목 · `#번호` · 라벨 · 사람 이름(표시 이름 · GitHub 로그인).
 * 대소문자를 가리지 않는다. 빈 검색어는 모두 맞다.
 */
export function matchesQuery(item: BoardItem, members: ReadonlyMap<Id, Pick<MemberDto, 'displayName' | 'githubLogin'>>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const people = item.memberIds.flatMap((id) => {
    const m = members.get(id)
    return m ? [m.displayName, m.githubLogin ?? ''] : []
  })
  const hay = [item.title, `#${item.number}`, ...item.labels, ...people].join('\n').toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** 마감 표시 — 오늘(한국 날짜) 기준. 완료된 것은 날짜만 흐리게. 마감이 없으면 null */
export function dueLabel(item: Pick<BoardItem, 'dueDate' | 'column'>, today: LocalDate): { text: string; tone: 'bad' | 'warn' | 'dim' } | null {
  if (item.dueDate === null) return null
  const days = Math.round((Date.parse(`${item.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (Number.isNaN(days)) return null
  if (item.column === 'done') return { text: monthDay(item.dueDate), tone: 'dim' }
  if (days < 0) return { text: `${-days}일 지남`, tone: 'bad' }
  if (days === 0) return { text: '오늘 마감', tone: 'warn' }
  return { text: `${days}일 남음`, tone: days <= 2 ? 'warn' : 'dim' }
}

/** "2026-11-07" → "11월 7일" (시간대와 상관없이 글자 그대로) */
export function monthDay(date: LocalDate): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일`
}

export type BoardSortKey = 'number' | 'title' | 'column' | 'priority' | 'member' | 'due'

/** 목록 정렬 — 값이 같으면 번호 순. 값이 없는 것(우선순위 · 담당 · 마감 없음)은 오름차순에서 뒤로 */
export function sortItems(
  items: readonly BoardItem[],
  key: BoardSortKey,
  dir: 'asc' | 'desc',
  members: ReadonlyMap<Id, Pick<MemberDto, 'displayName'>>,
): BoardItem[] {
  const sign = dir === 'asc' ? 1 : -1
  const name = (it: BoardItem) => (it.memberIds[0] === undefined ? null : (members.get(it.memberIds[0])?.displayName ?? null))
  const value = (it: BoardItem): number | string | null => {
    switch (key) {
      case 'number':
        return it.number
      case 'title':
        return it.title
      case 'column':
        return BOARD_COLUMNS.indexOf(it.column)
      case 'priority':
        // 높은 것이 먼저 오도록 무게를 뒤집는다
        return it.priority === null ? null : -PRIORITY_WEIGHT[it.priority]
      case 'member':
        return name(it)
      case 'due':
        return it.dueDate
    }
  }
  return [...items].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1 // 없는 값은 방향과 상관없이 뒤
      return byNumber(a, b)
    }
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko')
    return c * sign || byNumber(a, b)
  })
}
