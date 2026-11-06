// 요구사항 연결 · 표시 규칙 (FR-REQ-04 · 05 · 06 · 07, CONTRACTS_API.md 「8」 · CONTRACTS.md 「3」). 순수 함수 — mock · store · 요구사항 패널(RequirementBoard.tsx)이 같은 규칙을 쓴다.
// 서버는 같은 규칙으로 다시 검사 · 계산한다. 소유: D (#197).
import type { RequirementDto, RequirementLinkCreateRequest, RequirementLinkDto, TaskDto, Viewer, WorkspaceSnapshot } from '../types'

export const REQUIREMENT_MSG = {
  notAdmin: '요구사항 연결은 레포 관리자만 바꿀 수 있어요',
  notFound: '요구사항이나 이슈를 찾을 수 없어요',
  linkNotFound: '이미 끊긴 연결이에요',
  notActive: '지금 명세 문서에 없는 요구사항이라 새로 연결할 수 없어요',
  invalid: '연결할 요구사항과 이슈를 골라 주세요',
} as const

/** 요청 모양 검사 — 맞으면 null. 요구사항 · 이슈가 있는지 · active인지는 사무실 데이터로 따로 본다 */
export function linkRequestError(req: RequirementLinkCreateRequest | null | undefined): string | null {
  if (!req || typeof req.requirementId !== 'string' || req.requirementId === '' || typeof req.taskId !== 'string' || req.taskId === '') return REQUIREMENT_MSG.invalid
  return null
}

/** 같은 요구사항 · 이슈 연결이 이미 있으면 그 연결 — 있으면 요구사항 상태와 상관없이 200과 기존 연결(「8」) */
export function existingLink(links: readonly RequirementLinkDto[], req: RequirementLinkCreateRequest): RequirementLinkDto | null {
  return links.find((l) => l.requirementId === req.requirementId && l.taskId === req.taskId) ?? null
}

/**
 * 진행 수(FR-REQ-05) — 요구사항마다 연결된 이슈 수 · 그중 닫힌 이슈 수(닫힘 사유 무관). 저장하지 않고 연결 · 이슈 상태로 계산한다.
 * 바뀐 것이 없으면 같은 객체를 돌려준다(화면이 다시 그리지 않게).
 */
export function withProgress(requirements: readonly RequirementDto[], links: readonly RequirementLinkDto[], tasks: readonly Pick<TaskDto, 'id' | 'state'>[]): RequirementDto[] {
  const closed = new Set(tasks.filter((t) => t.state === 'closed').map((t) => t.id))
  const linked = new Map<string, number>()
  const done = new Map<string, number>()
  for (const l of links) {
    linked.set(l.requirementId, (linked.get(l.requirementId) ?? 0) + 1)
    if (closed.has(l.taskId)) done.set(l.requirementId, (done.get(l.requirementId) ?? 0) + 1)
  }
  return requirements.map((r) => {
    const linkedTaskCount = linked.get(r.id) ?? 0
    const doneTaskCount = done.get(r.id) ?? 0
    return r.linkedTaskCount === linkedTaskCount && r.doneTaskCount === doneTaskCount ? r : { ...r, linkedTaskCount, doneTaskCount }
  })
}

// ---- 요구사항 패널 표시 (#197) ----

/** 상태 표시 — active는 따로 표시하지 않는다(문서에 있는 기본 상태) */
export const REQUIREMENT_STATUS_LABEL: Record<RequirementDto['status'], string> = {
  active: '문서에 있음',
  missing: '문서에서 사라짐',
  needs_review: '확인 필요',
}

/** 상태 설명 — missing · needs_review는 연결을 지우지 않는다(연결 보존 확인용, CONTRACTS.md 「3」) */
export const REQUIREMENT_STATUS_HINT: Record<Exclude<RequirementDto['status'], 'active'>, string> = {
  missing: '명세 문서에서 이 제목을 찾지 못했어요. 연결은 남아 있고, 문서에 다시 생기면 그대로 이어져요.',
  needs_review: '명세 문서에 같은 원본 ID나 제목이 여러 개라 자동으로 고르지 않았어요. 문서를 고치면 다음 동기화에서 풀려요.',
}

export interface LinkedIssue {
  link: RequirementLinkDto
  /** 연결된 이슈 — Snapshot에 없으면 null(이슈가 사라졌거나 아직 동기화 전) */
  task: TaskDto | null
}

export interface RequirementRow {
  requirement: RequirementDto
  /** 연결된 이슈 — 열린 것 먼저, 그 안에서 이슈 번호 순 */
  issues: LinkedIssue[]
}

export interface RequirementSections {
  /** 문서에 있는 요구사항(active), 문서 순서(position) */
  active: RequirementRow[]
  /** 확인이 필요한 요구사항(missing · needs_review), 문서 순서 */
  others: RequirementRow[]
}

/** 열린 이슈 → 닫힌 이슈 → 찾을 수 없는 이슈, 그 안에서 이슈 번호 순 */
const issueOrder = (a: LinkedIssue, b: LinkedIssue) => {
  const rank = (x: LinkedIssue) => (x.task === null ? 2 : x.task.state === 'closed' ? 1 : 0)
  return rank(a) - rank(b) || (a.task?.githubIssueNumber ?? 0) - (b.task?.githubIssueNumber ?? 0)
}

/** 요구사항을 상태로 나누고 연결된 이슈를 붙인다 */
export function requirementSections(snapshot: Pick<WorkspaceSnapshot, 'requirements' | 'requirementLinks' | 'tasks'>): RequirementSections {
  const tasks = new Map(snapshot.tasks.map((t) => [t.id, t]))
  const linksOf = new Map<string, LinkedIssue[]>()
  for (const link of snapshot.requirementLinks) {
    const list = linksOf.get(link.requirementId) ?? []
    list.push({ link, task: tasks.get(link.taskId) ?? null })
    linksOf.set(link.requirementId, list)
  }
  const rows = [...snapshot.requirements]
    .sort((a, b) => a.position - b.position)
    .map((requirement) => ({ requirement, issues: (linksOf.get(requirement.id) ?? []).sort(issueOrder) }))
  return { active: rows.filter((r) => r.requirement.status === 'active'), others: rows.filter((r) => r.requirement.status !== 'active') }
}

/** 진행 표시 — "1/2 닫힘", 연결이 없으면 "연결 없음"(빈 구역 — FR-REQ-06) */
export function progressText(r: Pick<RequirementDto, 'linkedTaskCount' | 'doneTaskCount'>): string {
  return r.linkedTaskCount === 0 ? '연결 없음' : `${r.doneTaskCount}/${r.linkedTaskCount} 닫힘`
}

/** 진행률 0~1 — 연결이 없으면 0 */
export function progressRatio(r: Pick<RequirementDto, 'linkedTaskCount' | 'doneTaskCount'>): number {
  return r.linkedTaskCount === 0 ? 0 : Math.min(1, r.doneTaskCount / r.linkedTaskCount)
}

/** 요구사항 이름 — 원본 ID가 있으면 "FR-AUTH-01 · 제목", 없으면 제목만 */
export function requirementName(r: Pick<RequirementDto, 'sourceKey' | 'title'>): string {
  return r.sourceKey ? `${r.sourceKey} · ${r.title}` : r.title
}

/** 연결을 바꿀 수 있는가 — 레포 관리자(R2)만 (CONTRACTS_API.md 「8」). 화면 표시용, 서버가 다시 검사한다 */
export const canEditRequirementLinks = (viewer: Pick<Viewer, 'role'>) => viewer.role === 'repo_admin'
