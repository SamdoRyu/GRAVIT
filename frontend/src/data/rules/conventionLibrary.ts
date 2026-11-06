// 컨벤션 라이브러리 규칙 (FR-LIB, CONTRACTS_API.md 「17」). 순수 함수 — mock과 화면이 같은 규칙 · 문구를 쓴다.
// 서버(ConventionLibraryItemRequest의 @NotBlank · @Size, AuthorizationService.requireConventionLibraryEditor)와 같은 순서:
// 본문 검사(invalid) → 쓰기 역할(forbidden_role) → 없는 항목(not_found). 길이는 서버 @Size처럼 UTF-16 길이다. 소유: A (#225).
import type { ConventionLibraryItemRequest, ConventionTarget, MeResponse } from '../types'

export const CONVENTION_NAME_MAX = 100
export const CONVENTION_CONTENT_MAX = 20000
export const CONVENTION_DESCRIPTION_MAX = 2000

/** 계약 순서 — 목록도 이 순서로 묶는다(서버 ConventionLibraryService.ORDER) */
export const CONVENTION_TARGETS: readonly ConventionTarget[] = ['branch_name', 'commit_message', 'pr_title', 'pr_body', 'issue_body', 'issue_template', 'pr_template']

export const CONVENTION_TARGET_LABEL: Record<ConventionTarget, string> = {
  branch_name: '브랜치 이름',
  commit_message: '커밋 메시지',
  pr_title: 'PR 제목',
  pr_body: 'PR 본문',
  issue_body: '이슈 본문',
  issue_template: '이슈 템플릿',
  pr_template: 'PR 템플릿',
}

export const CONVENTION_MSG = {
  target: '대상을 골라 주세요',
  name: `이름은 1~${CONVENTION_NAME_MAX}자로 써 주세요`,
  content: `내용은 1~${CONVENTION_CONTENT_MAX}자로 써 주세요`,
  description: `설명은 ${CONVENTION_DESCRIPTION_MAX}자까지 쓸 수 있어요`,
  /** 서버 forbidden_role 문구 그대로 */
  notEditor: '이 작업을 할 권한이 없어요',
  notFound: '찾을 수 없어요',
} as const

const filled = (s: unknown, max: number) => typeof s === 'string' && s.trim() !== '' && s.length <= max

/** 등록 · 편집 요청 검사 — 맞으면 null. name · content는 공백만이면 안 되고, description은 null 또는 0~2000자 */
export function conventionRequestError(req: ConventionLibraryItemRequest): string | null {
  if (!CONVENTION_TARGETS.includes(req?.target)) return CONVENTION_MSG.target
  if (!filled(req.name, CONVENTION_NAME_MAX)) return CONVENTION_MSG.name
  if (!filled(req.content, CONVENTION_CONTENT_MAX)) return CONVENTION_MSG.content
  if (req.description !== null && (typeof req.description !== 'string' || req.description.length > CONVENTION_DESCRIPTION_MAX)) return CONVENTION_MSG.description
  return null
}

/**
 * 등록 · 편집 버튼을 보일까 — GitHub 계정 강사만(심사용 계정은 강사여도 읽기만 — 데이터 격리 P15). 화면 표시용, 서버가 다시 검사한다.
 * isInstructor는 지금 지정된 사무실이 하나 이상인 허용 목록 강사다(서버 판정과 같다).
 */
export const canEditConventionLibrary = (me: Pick<MeResponse, 'isInstructor' | 'accountType'> | null) => !!me && me.isInstructor && me.accountType === 'github'
