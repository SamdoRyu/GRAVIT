// 32. 예외 처리 UI (#274 — 디자인 보드 「GRAVIT 예외 처리 UI」): 전체 화면 · 상단 배너 · 폼 안 · 패널 안.
// mock DataSource의 failNext(개발 · E2E 전용)로 다음 요청 한 번을 실패시켜 실제 화면 흐름에서 본다. 배너의 연결 · 동기화 상태는
// store를 직접 바꾼다(mock에는 SSE 끊김 · GitHub 실패가 없다). 실제 서버의 CSRF · 401은 로컬 통합 확인으로 따로 본다.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

/** 다음 method 호출 한 번을 이 오류로 실패시킨다 */
async function failNext(page: Page, method: string, code: string, status: number | null, message = '서버 문구') {
  await page.evaluate(
    async ([m, c, s, msg]) => {
      const sessionPath = '/src/session.ts'
      const dsPath = '/src/data/DataSource.ts'
      const { currentSourceForTest } = await import(/* @vite-ignore */ sessionPath)
      const { DataError } = await import(/* @vite-ignore */ dsPath)
      currentSourceForTest().failNext(m, new DataError(msg, c, s ?? undefined))
    },
    [method, code, status, message] as const,
  )
}

/** session 액션을 부른다(callStore의 session판) */
function callSession(page: Page, action: string, ...args: unknown[]) {
  return page.evaluate(
    async ([a, rest]) => {
      const sessionPath = '/src/session.ts'
      const { useSession } = await import(/* @vite-ignore */ sessionPath)
      return useSession.getState()[a](...(rest as unknown[]))
    },
    [action, args] as const,
  )
}

/** store 상태를 바꾼다 — mock에 없는 연결 끊김 · 동기화 실패를 흉내 낸다 */
function patchStore(page: Page, patch: 'offline' | 'online' | 'syncFailing') {
  return page.evaluate(async (p) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const s = useOffice.getState()
    if (p === 'offline' || p === 'online') return useOffice.setState({ connection: p })
    const sync = { ...s.office.snapshot.sync, state: 'idle', isFailing: true, lastFailedAt: new Date().toISOString(), lastFailureCode: 'github_rate_limited', lastFailureMessage: null }
    useOffice.setState({ office: { ...s.office, snapshot: { ...s.office.snapshot, sync } } })
  }, patch)
}

const helpCount = (page: Page) => readStore(page, (s) => s.office.snapshot.helpRequests.length as number)

test('full screen: first office load fails → retry, 404 → "이 사무실을 열 수 없어요" → office list', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await callSession(page, 'leaveWorkspace')
  await expect(page.getByRole('region', { name: '사무실 고르기' })).toBeVisible()

  // 첫 Snapshot 읽기 실패 — 3D는 뒤에 그대로, 다시 시도하면 데이터만 다시 받는다
  await failNext(page, 'load', 'unavailable', 503)
  await callSession(page, 'enterWorkspace', 'ws_1')
  const boot = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: '사무실을 여는 중 문제가 생겼어요' }) })
  await expect(boot).toBeVisible()
  await expect(boot).not.toContainText(/unavailable|503/)
  await boot.getByRole('button', { name: '다시 시도' }).click()
  await expect(boot).toBeHidden()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')

  // 쓰던 중에 접근이 없어짐(404) — 없음 · 접근 없음을 같은 말로, 목록으로 돌아간다(다시 시도 없음)
  await failNext(page, 'load', 'not_found', 404)
  await callStore(page, 'reloadOffice')
  const closed = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: '이 사무실을 열 수 없어요' }) })
  await expect(closed).toBeVisible()
  await expect(closed.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
  await closed.getByRole('button', { name: '사무실 목록으로' }).click()
  await expect(page.getByRole('region', { name: '사무실 고르기' })).toBeVisible()
})

test('full screen: session expiry asks to sign in again and returns to the same office', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await failNext(page, 'load', 'unauthorized', 401)
  await callStore(page, 'reloadOffice')
  const expired = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: '다시 로그인해 주세요' }) })
  await expect(expired).toBeVisible()
  await expect(expired).toContainText('돌아갈 위치 · gitvillage')
  await expired.getByRole('button', { name: 'GitHub로 로그인' }).click()
  await expect.poll(() => readStore(page, (s) => (s.office?.status === 'ready' ? s.office.workspaceId : null))).toBe('ws_1')
})

test('full screen: the office list fails to load → retry keeps the session', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  // 개발 서버는 StrictMode라 화면을 열 때 읽기를 두 번 보낸다(앞의 것은 버려진다) — 두 번 모두 실패시킨다
  await failNext(page, 'listWorkspaces', 'unavailable', 503)
  await failNext(page, 'listWorkspaces', 'unavailable', 503)
  await callSession(page, 'leaveWorkspace')
  const failed = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: '사무실 목록을 불러오지 못했어요' }) })
  await expect(failed).toBeVisible()
  await expect(failed).toContainText('마지막 시도 ·')
  await failed.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByRole('region', { name: '사무실 고르기' }).getByRole('list', { name: '들어갈 수 있는 사무실' })).toBeVisible()
})

test('banners: realtime disconnect and sync failure are separate, the office stays usable, they close after fresh data', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const banner = (name: string) => page.locator('.sys-banner', { hasText: name })

  await patchStore(page, 'offline')
  await expect(banner('실시간 연결을 복구하고 있어요')).toBeVisible()
  // 화면을 막지 않는다 — 관리 패널을 그대로 쓴다
  await page.getByRole('region', { name: '관리 패널' }).getByRole('tab', { name: /도움 요청/ }).click()
  await expect(page.getByRole('region', { name: '관리 패널' }).getByRole('button', { name: '도움 요청 쓰기' })).toBeVisible()
  // 다시 붙으면 최신 Snapshot이 반영될 때까지 "복구됐어요", 반영되면 닫힌다
  await patchStore(page, 'online')
  await expect(banner('실시간 연결이 복구됐어요')).toBeVisible()
  await callStore(page, 'reloadOffice')
  await expect(page.locator('.sys-banner')).toHaveCount(0)
  await expect(page.getByText('다시 연결됐어요 · 최신 내용으로 바꿨어요')).toBeVisible()

  // 동기화 실패 → 다시 동기화 → 진행 중 → 끝나고 최신 데이터가 반영되면 닫힌다
  await patchStore(page, 'syncFailing')
  const failed = banner('동기화하지 못했어요')
  await expect(failed).toBeVisible()
  await expect(failed).toContainText('GitHub 요청 한도를 넘었어요')
  await failed.getByRole('button', { name: '다시 동기화' }).click()
  await expect(banner('GitHub와 동기화하고 있어요')).toBeVisible()
  await expect(page.locator('.sys-banner')).toHaveCount(0)
})

test('form: help request keeps its text on a permission error, CSRF needs a check before resubmitting, an uncertain write is not resent', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: /도움 요청/ }).click()
  await panel.getByRole('button', { name: '도움 요청 쓰기' }).click()
  const form = panel.getByRole('form', { name: '도움 요청 쓰기' })
  const text = '빌드가 로컬에서만 실패해요'
  await form.getByRole('textbox').fill(text)
  const before = await helpCount(page)

  // 권한 — 작업별 문구, 입력 유지
  await failNext(page, 'createHelpRequest', 'forbidden_role', 403)
  await form.getByRole('button', { name: '올리기' }).click()
  await expect(form.getByRole('alert')).toContainText('팀원만 도움을 요청할 수 있어요')
  await expect(form.getByRole('textbox')).toHaveValue(text)

  // CSRF(403 invalid) — 보안 확인 → 확인을 마치면 사람이 다시 제출
  await failNext(page, 'createHelpRequest', 'invalid', 403)
  await form.getByRole('button', { name: '올리기' }).click()
  await expect(form.getByRole('alert')).toContainText('보안 확인이 필요해요')
  await expect(form.getByRole('textbox')).toHaveValue(text)
  await form.getByRole('button', { name: '보안 확인하기' }).click()
  await expect(form.getByRole('status')).toContainText('보안 확인을 마쳤어요')
  expect(await helpCount(page)).toBe(before)
  await form.getByRole('button', { name: '다시 제출' }).click()
  await expect(page.getByText('도움 요청을 올렸어요')).toBeVisible()
  await expect.poll(() => helpCount(page)).toBe(before + 1)

  // 응답 없음 — 결과가 불확실하면 다시 보내지 않고 입력을 둔다
  await panel.getByRole('button', { name: '도움 요청 쓰기' }).click()
  await form.getByRole('textbox').fill('두 번째 막힌 점')
  await failNext(page, 'createHelpRequest', 'unavailable', 0)
  await form.getByRole('button', { name: '올리기' }).click()
  await expect(form.getByRole('alert')).toContainText('제출됐는지 확인하지 못했어요')
  await page.waitForTimeout(500)
  expect(await helpCount(page)).toBe(before + 1)
  await form.getByRole('button', { name: '최신 상태 보기' }).click()
  await expect(form.getByRole('alert')).toHaveCount(0)
  await expect(form.getByRole('textbox')).toHaveValue('두 번째 막힌 점')
})

test('form: PR evaluation keeps the written reason when the round changes or the PR closes', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const pr = await page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const found = snap.submissions.find((s: { state: string; authorMemberId: string | null; currentRound: { canEvaluate: boolean } | null }) => (s.state === 'open' || s.state === 'draft') && s.authorMemberId !== snap.viewer.memberId && s.currentRound?.canEvaluate)
    return found ? { id: found.id as string, title: found.title as string } : null
  })
  test.skip(pr === null, 'mock seed에 평가할 수 있는 PR이 없다')
  await callStore(page, 'selectInOffice', { kind: 'submission', id: pr!.id })
  const detail = page.getByRole('complementary', { name: 'PR 상세' })
  const form = detail.getByRole('form', { name: '내 평가' })
  await form.getByRole('radio', { name: '추천', exact: true }).click()
  const reason = '실패 응답을 계약 모양대로 맞췄어요'
  await form.getByRole('textbox').fill(reason)

  // 회차가 바뀜(409) — 작업별 문구, 이유 유지
  const loadedAt = await readStore(page, (st) => st.office.loadedAt)
  await failNext(page, 'evaluate', 'conflict', 409)
  await form.getByRole('button', { name: /평가 (남기기|바꾸기)/ }).click()
  await expect(form.getByRole('alert')).toContainText('평가 회차가 바뀌었거나 PR이 닫혔어요')
  await expect(form.getByRole('textbox')).toHaveValue(reason)
  // 충돌이면 store가 Snapshot을 다시 읽는다(읽기라 자동) — 다 읽은 뒤에도 쓴 이유는 그대로
  await expect.poll(() => readStore(page, (st) => st.office.loadedAt)).not.toBe(loadedAt)
  await expect(form.getByRole('textbox')).toHaveValue(reason)

  // 새 회차가 열린 Snapshot — 쓰던 이유는 남고 안내가 보인다
  const bump = (patch: Record<string, unknown>) =>
    page.evaluate(
      async ([id, p]) => {
        const storePath = '/src/store.ts'
        const { useOffice } = await import(/* @vite-ignore */ storePath)
        const s = useOffice.getState()
        const submissions = s.office.snapshot.submissions.map((x: { id: string; currentRound: Record<string, unknown> }) => (x.id === id ? { ...x, currentRound: { ...x.currentRound, ...p } } : x))
        useOffice.setState({ office: { ...s.office, snapshot: { ...s.office.snapshot, submissions } } })
      },
      [pr!.id, patch] as const,
    )
  await bump({ id: 'round_e2e_next', roundNumber: 9, myEvaluation: null, reasons: [] })
  await expect(detail.getByText('새 평가 회차(9회차)가 열렸어요')).toBeVisible()
  await expect(detail.getByRole('form', { name: '내 평가' }).getByRole('textbox')).toHaveValue(reason)

  // PR이 닫힘 — 평가는 못 하지만 쓰던 이유를 보여 준다
  await bump({ canEvaluate: false })
  await expect(detail.getByText('이 PR은 더 평가할 수 없어요')).toBeVisible()
  await expect(detail.getByLabel('작성하던 이유')).toContainText(reason)
})

test('panels: convention library load failure retries only itself; a permission error has no retry; empty is not an error', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const openLibrary = async () => {
    await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
    await page.getByRole('menuitem', { name: '컨벤션 라이브러리' }).click()
    return page.getByRole('dialog', { name: '컨벤션 라이브러리' })
  }
  const loadedAt = await readStore(page, (s) => s.office.loadedAt)

  // StrictMode — 대화상자를 열 때 두 번 읽는다(앞의 것은 버려진다)
  await failNext(page, 'listConventionLibrary', 'unavailable', 503)
  await failNext(page, 'listConventionLibrary', 'unavailable', 503)
  let dialog = await openLibrary()
  await expect(dialog.getByRole('alert')).toContainText('컨벤션을 불러오지 못했어요')
  await dialog.getByRole('button', { name: '다시 불러오기' }).click()
  await expect(dialog.getByRole('list', { name: '컨벤션 목록' })).toBeVisible()
  // 다시 불러오기는 이 목록만 — 사무실 Snapshot은 다시 읽지 않았다
  expect(await readStore(page, (s) => s.office.loadedAt)).toBe(loadedAt)
  await dialog.getByRole('button', { name: '닫기' }).first().click()

  await failNext(page, 'listConventionLibrary', 'forbidden_role', 403)
  await failNext(page, 'listConventionLibrary', 'forbidden_role', 403)
  dialog = await openLibrary()
  await expect(dialog.getByRole('alert')).toContainText('컨벤션 라이브러리를 볼 수 없어요')
  await expect(dialog.getByRole('button', { name: '다시 불러오기' })).toHaveCount(0)
})

test('panels: the repository list tells a GitHub rate limit from a lost GitHub connection', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  // StrictMode — 화면을 열 때 두 번 읽는다(앞의 것은 버려진다). 다시 불러오기는 한 번
  await failNext(page, 'listRepositories', 'github_rate_limited', 503)
  await failNext(page, 'listRepositories', 'github_rate_limited', 503)
  await failNext(page, 'listRepositories', 'github_unauthorized', 503)
  await callSession(page, 'leaveWorkspace')
  const repos = page.getByRole('region', { name: '사무실 고르기' }).getByRole('region', { name: '레포에서 사무실 열기' })
  await expect(repos.getByRole('alert')).toContainText('GitHub 요청 한도를 넘었어요')
  await repos.getByRole('button', { name: '다시 불러오기' }).click()
  await expect(repos.getByRole('alert')).toContainText('GitHub 연결이 끊겼어요')
  await expect(repos.getByRole('button', { name: 'GitHub 다시 연결' })).toBeVisible()
  // 사무실 목록은 그대로(레포 칸만 실패)
  await expect(page.getByRole('list', { name: '들어갈 수 있는 사무실' })).toBeVisible()
})

test('form: opening an office that is already open keeps the period and offers to reload the lists', async ({ page }) => {
  await page.goto('/')
  const picker = page.getByRole('region', { name: '사무실 고르기' })
  await expect(picker).toBeVisible()
  const samdo = picker.getByRole('region', { name: 'team-samdo 레포' })
  await samdo.getByRole('listitem').filter({ hasText: 'side-lab' }).getByRole('button', { name: '사무실 열기' }).click()
  const form = samdo.getByRole('form', { name: 'team-samdo/side-lab 사무실 열기' })
  await form.getByLabel(/명세 문서 경로/).fill('docs/req.md')
  const end = await form.getByLabel('끝 날짜').inputValue()
  await failNext(page, 'openWorkspace', 'conflict', 409)
  await form.getByRole('button', { name: '사무실 열기' }).click()
  await expect(form.getByRole('alert')).toContainText('이 레포에는 이미 열린 사무실이 있어요')
  await expect(form.getByLabel(/명세 문서 경로/)).toHaveValue('docs/req.md')
  await expect(form.getByLabel('끝 날짜')).toHaveValue(end)
  await form.getByRole('button', { name: '목록 다시 불러오기' }).click()
  await expect(picker.getByRole('list', { name: '들어갈 수 있는 사무실' })).toBeVisible()
})
