// 요구사항 연결 규칙 (FR-REQ-04 · 05 · 07, CONTRACTS_API.md 「8」 · CONTRACTS.md 「3」). 순수 함수 — mock과 store가 같은 규칙을 쓴다.
// 서버는 같은 규칙으로 다시 검사 · 계산한다. 소유: D (#197).
import type { RequirementDto, RequirementLinkCreateRequest, RequirementLinkDto, TaskDto } from '../types'

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
