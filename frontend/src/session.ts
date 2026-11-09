// 진입 흐름 — 로그인 → 사무실 고르기 → 사무실 (#64 · #68의 화면 몫, CONTRACTS_API.md 「2」 · 「3」). 소유: D.
// 라우터 없이 상태로 화면을 고른다(주소 설계는 팀이 정할 때까지 미룸 — SCREEN_ASSIGNMENTS route 칸).
// 사무실 데이터는 store(useOffice)가 갖고, 여기는 "누가 로그인했고 어느 사무실에 들어가는가"만 갖는다.
import { create } from 'zustand'
import { DataError, type DataSource } from './data/DataSource'
import type { Id, InboxItem, LoginOptions, MeResponse, OpenWorkspaceRequest, RepositoryChoiceResponse, WorkspaceListItem } from './data/types'
import { onSessionExpired, useOffice, type OnDataError } from './store'
import { toDataError } from './data/rules/errors'

/** checking = 세션 확인 중, signed_out = 로그인 화면, signed_in = 사무실 고르기 또는 사무실, error = 서버에 닿지 못함 */
export type SessionStatus = 'idle' | 'checking' | 'signed_out' | 'signed_in' | 'error'

export interface StartOptions {
  /** `?workspace=<id>` — 들어갈 수 있으면 바로 연다 */
  preferredWorkspace?: Id | null
}

interface SessionState {
  status: SessionStatus
  me: MeResponse | null
  /** 로그인 화면용 — signed_out일 때 채운다 */
  loginOptions: LoginOptions | null
  /** status error의 사유 */
  error: string | null
  /** mock DataSource인가 — GitHub 로그인 흉내 · 로그인 화면 안내 */
  mock: boolean
  /** 도착 장면(행성 줌인 → 사무실)을 지금 보여 주는가 — 계정마다 처음 사무실을 고를 때 한 번 */
  landing: boolean
  /**
   * 쓰던 중에 세션이 끝났다(API 401 — #274). signed_out과 함께 — 로그인 화면 대신 "다시 로그인해 주세요" 전체 화면.
   * place = 돌아갈 사무실 이름(다시 로그인하면 지난번 사무실로 들어간다). 처음 앱을 열 때 로그인 안 됨은 null(보통 로그인 화면)
   */
  expired: { place: string | null } | null
  /** 세션이 끝났음을 알린다 — 사무실을 닫고(지난번 사무실은 기억) 다시 로그인 화면으로 */
  expireSession: () => Promise<void>
  /** "다시 로그인해 주세요"에서 다른 방법(심사용 로그인)으로 — 보통 로그인 화면 */
  dismissExpired: () => void
  /**
   * 보안 확인(#274) — 쓰기가 CSRF 토큰 문제(403 invalid)로 거절됐을 때 기존 방식(공개 API)으로 토큰을 새로 받고 세션을 확인한다.
   * 다시 보내지는 않는다(사람이 "다시 제출"을 누른다). 마쳤으면 true, 세션이 끝났으면 다시 로그인 화면으로 가고 false
   */
  confirmSecurity: () => Promise<boolean>
  /** 앱을 열 때 한 번. 같은 source로 두 번 불러도(StrictMode) 한 번만 한다 */
  start: (source: DataSource, opts?: StartOptions) => Promise<void>
  /** 세션을 다시 확인한다(오류 화면의 다시 시도) */
  retry: () => Promise<void>
  /** GitHub 로그인 — 서버면 GitHub로 이동, mock이면 바로 로그인된 것으로 */
  loginWithGithub: () => void
  /** 보안 심사용 ID/PW 로그인. 실패하면 화면에 보일 문구, 성공하면 null */
  loginForReview: (username: string, password: string) => Promise<string | null>
  /** 사무실을 닫고 로그아웃 — 서버 응답과 상관없이 로그인 화면으로 */
  logout: () => Promise<void>
  /** 들어갈 수 있는 사무실 목록. 실패하면 알림 후 null — onError를 넘기면 알림 없이 그것을 부른다(화면이 직접 보인다) */
  listWorkspaces: (onError?: OnDataError) => Promise<WorkspaceListItem[] | null>
  /**
   * 사람이 고른 사무실에 들어간다 — 다음에 앱을 열면 다시 이 사무실로.
   * 이 계정이 처음 고른 것이면 도착 장면을 한 번 보여 준다(앱을 열 때 자동으로 들어가는 것은 장면 없이)
   */
  enterWorkspace: (workspaceId: Id) => Promise<void>
  /**
   * 사무실 안에서 다른 사무실로 옮긴다(도킹 우주선 — scene/DockShip.tsx). 다음에 앱을 열면 그 사무실로. 우주선 비행이 도착 연출이라
   * 처음 도착 장면은 보여 주지 않는다
   */
  travelToWorkspace: (workspaceId: Id) => Promise<void>
  /** 도착 장면이 끝났다 */
  finishLanding: () => void
  /** 사무실을 닫고 사무실 고르기로 — 다음에 앱을 열어도 고르기부터 */
  leaveWorkspace: () => void
  /** 새 사무실을 열 수 있는 조직 · 레포(GET /api/repositories). 실패하면 알림 후 null — onError는 위와 같다 */
  listRepositories: (onError?: OnDataError) => Promise<RepositoryChoiceResponse | null>
  /**
   * 레포의 사무실을 열고(POST /api/workspaces — R2만) 바로 들어간다 (#13 · #68).
   * 실패하면 화면에 보일 문구(입력 칸 아래), 성공하면 null. onError를 넘기면 실패한 오류도 받는다(폼이 code로 원인 · 다음 행동을 고른다)
   */
  openNewWorkspace: (request: OpenWorkspaceRequest, onError?: OnDataError) => Promise<string | null>
  /**
   * 강사 요청함(GET /api/instructor/inbox — 강사만, #224). 사무실 경로 밖이라 사무실을 열지 않아도 읽는다.
   * answered를 빼면 전부. 실패하면 알림 후 null — onError는 위와 같다
   */
  loadInstructorInbox: (answered?: boolean, onError?: OnDataError) => Promise<InboxItem[] | null>
}

let source: DataSource | null = null
let started = false

const LAST_KEY = (userId: Id) => `gravit.lastWorkspace.${userId}`
function remembered(userId: Id): Id | null {
  try {
    return localStorage.getItem(LAST_KEY(userId))
  } catch {
    return null
  }
}
function remember(userId: Id, workspaceId: Id | null) {
  try {
    if (workspaceId === null) localStorage.removeItem(LAST_KEY(userId))
    else localStorage.setItem(LAST_KEY(userId), workspaceId)
  } catch {
    /* 저장소를 못 쓰면 다음에 고르기부터 */
  }
}

// 도착 장면은 계정마다 한 번 — 본 계정을 기억한다(저장소를 못 쓰면 장면 없이)
const LANDING_KEY = (userId: Id) => `gravit.landingSeen.${userId}`
function takeFirstLanding(userId: Id): boolean {
  try {
    if (localStorage.getItem(LANDING_KEY(userId)) !== null) return false
    localStorage.setItem(LANDING_KEY(userId), '1')
    return true
  } catch {
    return false
  }
}

const isUnauthorized = (e: unknown) => e instanceof DataError && e.code === 'unauthorized'
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : '요청을 처리하지 못했어요')
const hasMockLogin = (s: DataSource | null): s is DataSource & { completeGithubLogin(): void } =>
  !!s && typeof (s as { completeGithubLogin?: unknown }).completeGithubLogin === 'function'

export const useSession = create<SessionState>((set, get) => {
  /** 읽기 실패 — 세션이 끝났으면 다시 로그인, 아니면 화면(onError) 또는 알림 */
  async function failRead(e: unknown, onError?: OnDataError) {
    const err = toDataError(e)
    if (onError) onError(err)
    if (err.code === 'unauthorized') await get().expireSession()
    else if (!onError) useOffice.getState().toast('bad', messageOf(err))
  }

  /** 세션을 확인한다. 로그인돼 있으면 autoEnter(없으면 지난번 사무실)에 들어간다 — 들어갈 수 없는 사무실이면 고르기 */
  async function refresh(autoEnter: Id | null) {
    const src = source
    if (!src) return
    set({ status: 'checking', error: null })
    let me: MeResponse
    try {
      me = await src.getMe()
    } catch (e) {
      if (!isUnauthorized(e)) {
        set({ status: 'error', error: messageOf(e) })
        return
      }
      try {
        set({ status: 'signed_out', me: null, loginOptions: await src.getLoginOptions() })
      } catch (e2) {
        set({ status: 'error', error: messageOf(e2) })
      }
      return
    }
    const target = autoEnter ?? remembered(me.user.userId)
    if (target !== null) {
      try {
        const list = await src.listWorkspaces()
        if (list.some((w) => w.id === target)) {
          set({ status: 'signed_in', me, loginOptions: null, expired: null })
          await open(target, false)
          return
        }
      } catch {
        /* 목록을 못 읽으면 고르기 화면에서 다시 읽는다 */
      }
    }
    set({ status: 'signed_in', me, loginOptions: null, expired: null })
  }

  /** 사무실을 연다. arrive면 이 계정의 첫 고르기일 때 도착 장면을 켠다 */
  async function open(workspaceId: Id, arrive: boolean) {
    const src = source
    const me = get().me
    if (!src || !me) return
    remember(me.user.userId, workspaceId)
    if (arrive && takeFirstLanding(me.user.userId)) set({ landing: true })
    await useOffice.getState().openOffice(src, workspaceId)
  }

  return {
    status: 'idle',
    me: null,
    loginOptions: null,
    error: null,
    mock: false,
    landing: false,
    expired: null,

    start: async (src, opts = {}) => {
      if (started && src === source) return
      started = true
      source = src
      set({ mock: hasMockLogin(src) })
      await refresh(opts.preferredWorkspace ?? null)
    },
    retry: () => refresh(null),

    loginWithGithub: () => {
      const src = source
      if (hasMockLogin(src)) {
        src.completeGithubLogin()
        void refresh(null)
        return
      }
      // 로그인 선택지를 못 받았어도(세션 만료 화면 · 레포 목록의 "GitHub 다시 연결") GitHub 로그인 주소(계약 「2」 고정 경로)로 보낸다
      const url = get().loginOptions?.githubLoginUrl ?? '/oauth2/authorization/github'
      // 서버가 GitHub를 거쳐 화면 주소로 돌려보낸다 — 돌아오면 start가 세션을 다시 확인한다
      if (url) window.location.assign(url)
    },

    loginForReview: async (username, password) => {
      const src = source
      if (!src) return '요청을 처리하지 못했어요'
      try {
        await src.reviewLogin({ username, password })
      } catch (e) {
        return messageOf(e)
      }
      await refresh(null)
      return null
    },

    logout: async () => {
      useOffice.getState().closeOffice()
      const src = source
      set({ status: 'checking', me: null, landing: false, expired: null })
      try {
        await src?.logout()
      } catch {
        /* 세션이 이미 없어도 로그인 화면으로 간다 */
      }
      await refresh(null)
    },

    listWorkspaces: async (onError) => {
      const src = source
      if (!src) return null
      try {
        return await src.listWorkspaces()
      } catch (e) {
        // 세션이 끝났으면 다시 로그인 화면으로
        await failRead(e, onError)
        return null
      }
    },

    enterWorkspace: (workspaceId) => open(workspaceId, true),
    travelToWorkspace: (workspaceId) => open(workspaceId, false),
    finishLanding: () => set({ landing: false }),

    leaveWorkspace: () => {
      const me = get().me
      if (me) remember(me.user.userId, null)
      set({ landing: false })
      useOffice.getState().closeOffice()
    },

    listRepositories: async (onError) => {
      const src = source
      if (!src) return null
      try {
        return await src.listRepositories()
      } catch (e) {
        await failRead(e, onError)
        return null
      }
    },

    openNewWorkspace: async (request, onError) => {
      const src = source
      if (!src) return '요청을 처리하지 못했어요'
      let opened: Id
      try {
        opened = (await src.openWorkspace(request)).id
      } catch (e) {
        onError?.(toDataError(e))
        if (isUnauthorized(e)) {
          await get().expireSession()
          return null
        }
        return messageOf(e)
      }
      await get().enterWorkspace(opened)
      return null
    },

    loadInstructorInbox: async (answered, onError) => {
      const src = source
      if (!src) return null
      try {
        return await src.getInstructorInbox(answered)
      } catch (e) {
        await failRead(e, onError)
        return null
      }
    },

    expireSession: async () => {
      // 이미 로그인 화면 · 확인 중이면 그대로(여러 요청이 한꺼번에 401을 받아도 한 번만)
      if (get().status !== 'signed_in') return
      const ws = useOffice.getState().office?.snapshot?.workspace
      // 지난번 사무실 기억(remember)은 지우지 않는다 — 다시 로그인하면 그 사무실로 들어간다
      useOffice.getState().closeOffice()
      set({ status: 'signed_out', me: null, landing: false, loginOptions: null, expired: { place: ws ? (ws.githubRepo ?? ws.displayName) : null } })
      const src = source
      if (!src) return
      try {
        const loginOptions = await src.getLoginOptions()
        if (get().status === 'signed_out') set({ loginOptions })
      } catch {
        /* 로그인 선택지를 못 받아도 GitHub 로그인 주소로 보낼 수 있다 */
      }
    },
    dismissExpired: () => set({ expired: null }),

    confirmSecurity: async () => {
      const src = source
      if (!src) return false
      try {
        // CSRF 쿠키는 공개 API가 함께 준다(계약 「2」 — api DataSource의 primeCsrf와 같은 길), 세션은 /api/me로 확인
        await src.getLoginOptions()
        await src.getMe()
        return true
      } catch (e) {
        if (isUnauthorized(e)) await get().expireSession()
        return false
      }
    },
  }
})

// 사무실 API가 세션 만료(401)를 받으면 다시 로그인 화면으로 (#274)
onSessionExpired(() => void useSession.getState().expireSession())

/** 테스트 전용 — 지금 쓰는 DataSource(E2E가 mock의 failNext로 예외 화면을 띄운다 — #274) */
export function currentSourceForTest(): DataSource | null {
  return source
}

/** 테스트 전용 — 모듈 상태를 처음으로 되돌린다 */
export function resetSessionForTest() {
  source = null
  started = false
  useSession.setState({ status: 'idle', me: null, loginOptions: null, error: null, mock: false, landing: false, expired: null })
}
