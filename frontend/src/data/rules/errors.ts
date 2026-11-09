// 예외 처리 UI 규칙 (#274 — CONTRACTS.md 「6」 상황별 code · CONTRACTS_API.md 「읽는 법」 공통 실패). 순수 함수 — 화면 · 테스트가 같이 쓴다. 소유: D.
// HTTP 상태만 보지 않고 "오류 code + 실패한 작업"으로 화면에 보일 원인 · 다음 행동을 고른다. 화면에는 code를 보이지 않는다.
// 배치(디자인 보드 「GRAVIT 예외 처리 UI」): 전체 화면(officeProblem) · 폼 안(writeProblem) · 패널 안(panelProblem). 상단 배너는 ui/systemBanners.ts.
import { DataError, type DataErrorCode } from '../DataSource'

/** 알 수 없는 예외도 DataError로 — 화면은 code로만 고른다 */
export function toDataError(e: unknown): DataError {
  if (e instanceof DataError) return e
  return new DataError(e instanceof Error && e.message ? e.message : '요청을 처리하지 못했어요', 'unavailable')
}

/** CSRF 토큰 없음 · 틀림, 허용 출처가 아닌 쓰기 — `403 invalid`. 같은 403이라도 `forbidden_role`(역할)과 다르다 */
export function isCsrfRejected(e: DataError): boolean {
  return e.code === 'invalid' && e.status === 403
}

/**
 * 결과가 불확실한 쓰기 — 응답을 받지 못했거나(status 0) 서버 오류(5xx)라 서버에 반영됐는지 모른다.
 * 화면은 자동으로 다시 보내지 않고, 최신 상태를 확인한 뒤 사람이 다시 제출하게 한다. 상태를 모르면(mock) 불확실로 본다.
 */
export function isUncertainWrite(e: DataError): boolean {
  return e.code === 'unavailable' && (e.status === undefined || e.status === 0 || e.status >= 500)
}

// ---- 폼 안 (쓰기) ---------------------------------------------------------------------

/** 오류를 보이는 폼 — 사무실 열기 · 요구사항–이슈 연결 · PR 평가 · 회의 안건 올리기 · 도움 요청 쓰기 */
export type WriteAction = 'openWorkspace' | 'linkRequirement' | 'evaluate' | 'raiseAgenda' | 'createHelp'

/**
 * 폼 상단 띠의 다음 행동.
 * reload = 최신 사무실 데이터 다시 읽기, refreshLists = 사무실 · 레포 목록 다시 읽기, csrf = 보안 확인(토큰 새로 받기),
 * resubmit = 확인을 마쳤으니 같은 내용으로 다시 제출(사람이 누른다)
 */
export type WriteNext = 'reload' | 'refreshLists' | 'csrf' | 'resubmit'

export type WriteProblem =
  /** 입력 오류 — 입력란 아래 */
  | { kind: 'field'; text: string }
  /** 세션 만료 — 전체 화면(다시 로그인)이 대신한다 */
  | { kind: 'session' }
  /** 권한 · 대상 없음 · 충돌 · 보안 확인 · 결과 불확실 — 폼 상단 띠 */
  | { kind: 'notice'; tone: 'bad' | 'warn' | 'ok'; title: string; body: string; next: WriteNext | null }

type Notice = Extract<WriteProblem, { kind: 'notice' }>
const notice = (tone: Notice['tone'], title: string, body: string, next: WriteNext | null = null): Notice => ({ kind: 'notice', tone, title, body, next })

interface ActionText {
  /** 입력 오류인데 서버 문구가 없을 때 */
  invalid: string
  forbidden: [title: string, body: string]
  notFound: [title: string, body: string]
  conflict: [title: string, body: string]
  /** 최신 상태를 확인하는 다음 행동 — 사무실 밖(사무실 열기)은 목록, 안은 Snapshot */
  refresh: WriteNext
}

const KEEP = '작성한 내용은 그대로 있어요.'

const WRITE_TEXT: Record<WriteAction, ActionText> = {
  openWorkspace: {
    invalid: '기간과 명세 문서 경로를 다시 확인해 주세요.',
    forbidden: ['레포 관리자만 사무실을 열 수 있어요', '이 레포의 관리자 권한이 바뀌었을 수 있어요. 레포 관리자에게 사무실을 열어 달라고 부탁해 주세요.'],
    notFound: ['이 레포를 찾을 수 없어요', '레포가 지워졌거나 접근 권한이 바뀌었어요. 목록을 다시 불러와 확인해 주세요.'],
    conflict: ['이 레포에는 이미 열린 사무실이 있어요', '다른 레포 관리자가 먼저 열었을 수 있어요. 목록을 다시 불러온 뒤 그 사무실로 들어가 주세요.'],
    refresh: 'refreshLists',
  },
  linkRequirement: {
    invalid: '연결할 요구사항과 이슈를 다시 골라 주세요.',
    forbidden: ['레포 관리자만 이슈를 연결할 수 있어요', '연결이 필요하면 레포 관리자에게 부탁해 주세요.'],
    notFound: ['요구사항이나 이슈를 찾을 수 없어요', '동기화로 지워졌을 수 있어요. 최신 목록을 불러와 다시 골라 주세요.'],
    conflict: ['진행 중인 요구사항이 아니에요', '명세 문서에서 빠졌거나 확인이 필요한 요구사항에는 이슈를 연결할 수 없어요. 최신 목록에서 다시 골라 주세요.'],
    refresh: 'reload',
  },
  evaluate: {
    invalid: '이유를 1~200자로 적어 주세요.',
    forbidden: ['이 PR은 평가할 수 없어요', `강사 계정과 PR 작성자는 평가를 남길 수 없어요. 남겨진 이유는 그대로 볼 수 있어요.`],
    notFound: ['이 PR을 찾을 수 없어요', `동기화로 지워졌을 수 있어요. ${KEEP}`],
    conflict: ['평가 회차가 바뀌었거나 PR이 닫혔어요', '작성한 이유는 그대로 두었어요. 최신 회차를 확인한 뒤 다시 제출해 주세요.'],
    refresh: 'reload',
  },
  raiseAgenda: {
    invalid: '안건 종류와 원본이 맞는지, 제목을 적었는지 확인해 주세요.',
    forbidden: ['팀원만 안건을 올릴 수 있어요', `강사 계정은 안건을 올릴 수 없어요. ${KEEP}`],
    notFound: ['안건의 원본을 찾을 수 없어요', `이슈 · PR이 동기화로 지워졌을 수 있어요. 최신 목록을 불러와 다시 골라 주세요. ${KEEP}`],
    conflict: ['안건을 올리지 못했어요', `그 사이 회의 상태가 바뀌었어요. 최신 상태를 확인한 뒤 다시 올려 주세요. ${KEEP}`],
    refresh: 'reload',
  },
  createHelp: {
    invalid: '막힌 내용을 1~2000자로 적어 주세요.',
    forbidden: ['팀원만 도움을 요청할 수 있어요', `강사 계정이거나, 내 스탠드업이 아닌 글에서 요청했어요. ${KEEP}`],
    notFound: ['연결한 스탠드업을 찾을 수 없어요', `스탠드업이 지워졌을 수 있어요. ${KEEP}`],
    conflict: ['도움 요청을 올리지 못했어요', `그 사이 상태가 바뀌었어요. 최신 상태를 확인한 뒤 다시 올려 주세요. ${KEEP}`],
    refresh: 'reload',
  },
}

/** 보안 확인(CSRF)이 필요하다 — 제출은 아직 되지 않았다 */
export const CSRF_NOTICE: Notice = notice('warn', '보안 확인이 필요해요', `${KEEP} 보안 확인을 마치면 다시 제출할 수 있어요. 아직 제출되지 않았어요.`, 'csrf')
/** 보안 확인을 마쳤다 — 사람이 "다시 제출"을 누른다(자동으로 보내지 않는다) */
export const CSRF_DONE_NOTICE: Notice = notice('ok', '보안 확인을 마쳤어요', '작성한 내용 그대로 다시 제출할 수 있어요.', 'resubmit')
/** 보안 확인(토큰 받기) 자체가 실패했다 */
export const CSRF_FAILED_NOTICE: Notice = notice('warn', '보안 확인을 마치지 못했어요', `서버에 연결하지 못했어요. ${KEEP} 잠시 뒤 다시 확인해 주세요.`, 'csrf')

/** 쓰기 실패 → 폼에 보일 것. 오류 code와 실패한 작업으로 고른다 */
export function writeProblem(action: WriteAction, error: unknown): WriteProblem {
  const e = toDataError(error)
  const t = WRITE_TEXT[action]
  if (e.code === 'unauthorized') return { kind: 'session' }
  if (isCsrfRejected(e)) return CSRF_NOTICE
  switch (e.code) {
    case 'invalid':
      return { kind: 'field', text: e.message || t.invalid }
    case 'forbidden_role':
      return notice('bad', ...t.forbidden)
    case 'not_found':
      return notice('bad', ...t.notFound, t.refresh)
    case 'conflict':
      return notice('warn', ...t.conflict, t.refresh)
    case 'github_unauthorized':
      return notice('bad', 'GitHub 연결이 끊겼어요', `GitHub로 다시 로그인한 뒤 다시 제출해 주세요. ${KEEP}`)
    case 'github_rate_limited':
      return notice('warn', 'GitHub 요청 한도를 넘었어요', `잠시 뒤 다시 제출해 주세요. 한도는 GitHub에서 자동으로 풀려요. ${KEEP}`)
    case 'unavailable':
    default:
      return isUncertainWrite(e)
        ? notice('warn', '제출됐는지 확인하지 못했어요', `서버 응답을 받지 못해 자동으로 다시 보내지 않았어요. 최신 상태를 확인한 뒤 필요하면 다시 제출해 주세요. ${KEEP}`, t.refresh)
        : notice('warn', '제출하지 못했어요', `잠시 뒤 다시 제출해 주세요. ${KEEP}`)
  }
}

// ---- 패널 안 (읽기) -------------------------------------------------------------------

/** 실패를 패널 안에 보이는 목록 — GitHub 레포 고르기 · 학습 타임라인 · 강사 요청함 · 컨벤션 라이브러리 */
export type PanelKind = 'repositories' | 'timeline' | 'inbox' | 'conventionLibrary'

/**
 * retry = 그 패널 데이터만 다시 불러오기, reconnectGithub = GitHub로 다시 로그인(토큰 새로 받기).
 * null = 다시 불러와도 결과가 같다(권한 · 대상 없음) — 버튼을 두지 않는다
 */
export type PanelAction = 'retry' | 'reconnectGithub'

export type PanelProblem =
  | { kind: 'session' }
  | { kind: 'state'; tone: 'bad' | 'warn'; title: string; body: string; foot: string | null; action: PanelAction | null }

interface PanelText {
  /** "○○을 불러오지 못했어요"의 ○○ — 조사까지 */
  subject: string
  forbidden: [title: string, body: string]
  notFound: [title: string, body: string]
  /** 조회 실패 아래 작은 글 */
  failFoot: string
}

const PANEL_TEXT: Record<PanelKind, PanelText> = {
  repositories: {
    subject: '레포 목록을',
    forbidden: ['레포를 고르지 않는 계정이에요', '강사 · 심사용 계정은 레포에서 사무실을 열지 않아요. 위 목록에서 들어갈 사무실을 골라 주세요.'],
    notFound: ['레포 목록을 찾을 수 없어요', '잠시 뒤 다시 열어 주세요.'],
    failFoot: '작성 중이던 사무실 정보는 그대로 있어요',
  },
  timeline: {
    subject: '학습 타임라인을',
    forbidden: ['이 기록을 볼 권한이 없어요', '본인과 지정된 강사만 학습 타임라인을 볼 수 있어요.'],
    notFound: ['이 팀원의 기록을 찾을 수 없어요', '사무실에서 빠진 팀원일 수 있어요. 다른 팀원을 골라 주세요.'],
    failFoot: '다른 패널은 그대로 사용할 수 있어요',
  },
  inbox: {
    subject: '요청 목록을',
    forbidden: ['강사 계정만 열 수 있어요', '지금 지정된 사무실이 있는 강사만 요청함을 볼 수 있어요. 강사 지정은 레포 관리자가 해요.'],
    notFound: ['요청함을 찾을 수 없어요', '잠시 뒤 다시 열어 주세요.'],
    failFoot: '이미 답한 요청은 그대로 남아 있어요',
  },
  conventionLibrary: {
    subject: '컨벤션을',
    forbidden: ['컨벤션 라이브러리를 볼 수 없어요', '로그인한 계정으로 다시 열어 주세요.'],
    notFound: ['컨벤션 라이브러리를 찾을 수 없어요', '잠시 뒤 다시 열어 주세요.'],
    failFoot: '저장된 컨벤션은 사라지지 않아요',
  },
}

type PanelState = Extract<PanelProblem, { kind: 'state' }>
const panelState = (tone: PanelState['tone'], title: string, body: string, action: PanelAction | null, foot: string | null = null): PanelState => ({ kind: 'state', tone, title, body, foot, action })

/** 읽기 실패 → 패널 안에 보일 것. 권한 오류(다시 불러와도 같음) · GitHub 연결 오류 · 요청 한도 · 조회 실패를 나눈다 */
export function panelProblem(panel: PanelKind, error: unknown): PanelProblem {
  const e = toDataError(error)
  const t = PANEL_TEXT[panel]
  switch (e.code) {
    case 'unauthorized':
      return { kind: 'session' }
    case 'forbidden_role':
      return panelState('bad', ...t.forbidden, null)
    case 'not_found':
      return panelState('bad', ...t.notFound, null)
    case 'github_unauthorized':
      return panelState('bad', 'GitHub 연결이 끊겼어요', `${t.subject} 받으려면 GitHub로 다시 로그인해 주세요.`, 'reconnectGithub', '다시 로그인하면 이 화면으로 돌아와요')
    case 'github_rate_limited':
      return panelState('warn', 'GitHub 요청 한도를 넘었어요', 'GitHub가 잠시 요청을 막았어요. 몇 분 뒤 다시 불러와 주세요.', 'retry', '한도는 GitHub에서 자동으로 풀려요')
    default:
      return panelState('warn', `${t.subject} 불러오지 못했어요`, '잠시 뒤 다시 불러오면 대부분 해결돼요.', 'retry', t.failFoot)
  }
}

// ---- 전체 화면 (사무실) ------------------------------------------------------------------

/**
 * 사무실 Snapshot 읽기 실패 → 무엇을 보일지.
 * session = 다시 로그인(전체 화면), closed = "이 사무실을 열 수 없어요"(없음 · 접근 없음을 같은 말로 — 존재를 숨긴다),
 * boot = 첫 읽기 실패(전체 화면, 다시 시도), stale = 받은 데이터가 있다(배너 — 화면은 계속 쓴다)
 */
export type OfficeProblem = 'session' | 'closed' | 'boot' | 'stale'

export function officeProblem(error: { code: DataErrorCode } | null, hasSnapshot: boolean): OfficeProblem | null {
  if (!error) return null
  if (error.code === 'unauthorized') return 'session'
  if (error.code === 'not_found') return 'closed'
  return hasSnapshot ? 'stale' : 'boot'
}
