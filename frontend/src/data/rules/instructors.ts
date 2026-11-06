// 강사 지정 · 해제 규칙 (FR-AUTH-06, CONTRACTS_API.md 「7」). 순수 함수 — mock과 화면이 같은 규칙 · 문구를 쓴다.
// 서버(InstructorRosterService)와 같은 순서로 본다: 요청한 사람 자신 → 허용 목록. 소유: D (#53).
import type { InstructorAssignmentDto, InstructorCandidateDto, Viewer } from '../types'

export const INSTRUCTOR_MSG = {
  notAdmin: '이 작업을 할 권한이 없어요',
  self: '자기 자신은 강사로 지정할 수 없어요',
  notAllowlisted: '승인된 강사 계정이 아니에요',
  notFound: '찾을 수 없어요',
} as const

/** 지정 요청 검사 — 맞으면 null. 요청한 사람 자신이면 conflict, 허용 목록 밖이면 invalid */
export function assignError(githubUserId: string, requesterGithubUserId: string | null, allowlist: readonly string[]): { code: 'conflict' | 'invalid'; message: string } | null {
  if (requesterGithubUserId !== null && requesterGithubUserId === githubUserId) return { code: 'conflict', message: INSTRUCTOR_MSG.self }
  if (!allowlist.includes(githubUserId)) return { code: 'invalid', message: INSTRUCTOR_MSG.notAllowlisted }
  return null
}

/** 강사를 지정 · 해제할 수 있는가 — 레포 관리자(R2)만. 화면 표시용, 서버가 다시 검사한다 */
export const canManageInstructors = (viewer: Pick<Viewer, 'role'>) => viewer.role === 'repo_admin'

/** 표시 이름 — 이름 → 로그인 → "GitHub 사용자 #ID"(아직 로그인한 적 없는 강사) */
export function instructorName(x: Pick<InstructorAssignmentDto, 'githubUserId' | 'githubLogin'> & { displayName?: string | null }): string {
  return x.displayName ?? (x.githubLogin ? `@${x.githubLogin}` : `GitHub 사용자 #${x.githubUserId}`)
}

/** 지정할 수 있는 후보 — 허용 목록 중 아직 지정되지 않은 사람, GitHub 사용자 ID 순(서버 순서 그대로) */
export const assignableCandidates = (candidates: readonly InstructorCandidateDto[]) => candidates.filter((c) => !c.isAssigned)
