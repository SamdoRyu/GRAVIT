// 34. 강사 우주선 · 새 강사 답변 점 (#290).
// - 우주선: "강사에게 요청"한 열린 도움 요청에 강사 답변이 없는 동안 강사 라코가 차 우주선을 타고 게시판 위에 와 있고, 강사 답변이
//   달리면 날아간다. mock에는 강사 계정이 없어 강사 답변은 store의 확인 결과를 "답변 있음"으로 바꿔 흉내 낸다.
// - 사무실을 열 때(새로고침 · 옮기기)의 첫 상태는 비행 없이 보인다(#328) — 기다리는 글이 있으면 이미 와 있고, 없는 사무실(시연
//   ws_2)에는 처음부터 없다. 이전 사무실의 우주선도 비행 없이 사라진다. 같은 사무실 안의 변화만 날아오고 날아간다.
// - 빨간 점: 강사가 답한 글을 이 사람이 아직 열어 보지 않았으면 도움 요청 탭 · 그 글 · 3D 게시판 알약에 점이 있고, 그 글을 열면 꺼진다.
// mock seed: hr_2(박데브, 강사에게 요청 · 답 없음 — 우주선), hr_4(이삼도, 강사 답변 hc_3 — 빨간 점).
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

/** 장면에 강사 우주선이 있는가 */
function shipInScene(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return !!rt.sceneApi.get?.()?.scene.getObjectByName('instructor-ship')
  })
}

/**
 * 우주선이 처음 보이는 프레임까지 기다려, 그때 머무는 자리(게시판 위 — 통신 허브 x)에서 가로로 얼마나 떨어져 있는지(시안 단위).
 * 날아오면 출발점(동쪽 34)에서 시작하므로 크고, 비행 없이 나타나면 0이다. 10초 안에 안 보이면 null.
 */
function firstShipOffset(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const geoPath = '/src/theme/station/geometry.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const { COMM_HUB } = await import(/* @vite-ignore */ geoPath)
    const end = performance.now() + 10_000
    while (performance.now() < end) {
      const ship = rt.sceneApi.get?.()?.scene.getObjectByName('instructor-ship')
      const root = ship?.children[0]
      if (root) return Math.abs(root.position.x - COMM_HUB.x)
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    return null
  })
}

/** mock store의 hr_2 강사 답변 확인 결과를 바꾼다 — 강사 답변이 달렸다 / 없다 */
function setHr2Answered(page: Page, answered: boolean) {
  return page.evaluate(async (answered) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const s = useOffice.getState()
    const h = s.office.snapshot.helpRequests.find((x: { id: string }) => x.id === 'hr_2')
    useOffice.setState({ instructorAnswers: { ...s.instructorAnswers, hr_2: { commentCount: h.commentCount, answered, lastAnswerId: answered ? 'hc_new' : null } } })
  }, answered)
}

async function openHelpTab(page: Page) {
  await page.evaluate(async () => {
    const uiPath = '/src/ui/uiState.ts'
    const { useUi } = await import(/* @vite-ignore */ uiPath)
    useUi.getState().setPanelOpen(true)
    useUi.getState().setTab('help')
  })
  return page.getByRole('region', { name: '관리 패널' })
}

test.beforeEach(({ source }) => {
  test.skip(source !== 'mock', 'mock seed의 강사 요청(hr_2 · hr_4)으로 본다')
})

test('a new instructor answer lights a red dot on the help tab, the post and the board; opening the post clears it (#290)', async ({ page, source }) => {
  await openApp(page, source)
  const panel = await openHelpTab(page)
  const tabDot = panel.getByRole('tab', { name: /^도움 요청/ }).getByRole('img', { name: '새 강사 답변' })
  const post = panel.getByRole('button', { name: /요구사항 판에 이슈를 놓아도.*\(새 강사 답변\)$/ })

  await expect(tabDot).toBeVisible()
  await expect(post).toBeVisible()
  await expect(panel.locator('.help-dot')).toHaveCount(1)
  await expect(page.locator('[data-board-new-answer]')).toHaveCount(1)

  // 그 글을 열어 강사 답변을 본다 — 점이 모두 꺼진다
  await post.click()
  await expect(panel.getByRole('region', { name: '도움 요청 상세' })).toContainText('박멘토')
  await expect(tabDot).toHaveCount(0)
  await expect(page.locator('[data-board-new-answer]')).toHaveCount(0)
  await panel.getByRole('button', { name: '목록' }).click()
  await expect(panel.locator('.help-dot')).toHaveCount(0)

  // 본 것은 이 브라우저에 남는다 — 다시 열어도 점이 없다
  await page.reload()
  await openApp(page, source, { scene: false })
  const again = await openHelpTab(page)
  await expect(again.getByRole('button', { name: /^도움 요청: 요구사항 판에 이슈를 놓아도/ })).toBeVisible()
  await expect(again.locator('.help-dot')).toHaveCount(0)
})

test('the instructor ship stays while an instructor answer is awaited and flies away once it is answered (#290)', async ({ page, source }) => {
  await openApp(page, source)
  await expect.poll(() => shipInScene(page)).toBe(true)

  await page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const s = useOffice.getState()
    const h = s.office.snapshot.helpRequests.find((x: { id: string }) => x.id === 'hr_2')
    useOffice.setState({ instructorAnswers: { ...s.instructorAnswers, hr_2: { commentCount: h.commentCount, answered: true, lastAnswerId: 'hc_new' } } })
  })
  await expect.poll(() => shipInScene(page), { timeout: 8_000 }).toBe(false)
  // 강사 답변이 왔으니 hr_2에도 새 강사 답변 점이 켜진다
  const panel = await openHelpTab(page)
  await expect(panel.getByRole('button', { name: /3D 상자를 끌면.*\(새 강사 답변\)$/ })).toBeVisible()
})

test('moving to an office with no awaited help request shows no ship and no departure; coming back brings it again (#328)', async ({ page, source }) => {
  await openApp(page, source)
  await expect.poll(() => shipInScene(page)).toBe(true)

  // 기다리는 글이 없는 시연 사무실(ws_2)로 옮기고, 출발 비행(2초)이 남아 있을 동안 여러 번 본다 — 한 번도 보이면 안 된다
  const seenWhileMoving = await page.evaluate(async () => {
    const sessionPath = '/src/session.ts'
    const rtPath = '/src/scene/runtime.ts'
    const { useSession } = await import(/* @vite-ignore */ sessionPath)
    const rt = await import(/* @vite-ignore */ rtPath)
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    void useSession.getState().travelToWorkspace('ws_2')
    await frame()
    await frame()
    const seen: boolean[] = []
    for (let i = 0; i < 12; i++) {
      seen.push(!!rt.sceneApi.get?.()?.scene.getObjectByName('instructor-ship'))
      await new Promise((r) => setTimeout(r, 200))
    }
    return seen
  })
  expect(seenWhileMoving).not.toContain(true)
  await expect.poll(() => page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const o = useOffice.getState().office
    return o?.status === 'ready' ? o.workspaceId : null
  })).toBe('ws_2')
  expect(await shipInScene(page)).toBe(false)

  // 기다리는 글이 있는 사무실로 돌아오면 확인 뒤 날아오지 않고 이미 게시판 위에 있다
  await page.evaluate(async () => {
    const sessionPath = '/src/session.ts'
    const { useSession } = await import(/* @vite-ignore */ sessionPath)
    void useSession.getState().travelToWorkspace('ws_1')
  })
  expect(await firstShipOffset(page)).toBeLessThan(1)
})

test('after a reload the awaited ship is already over the board; within the office it still flies in and out (#328)', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await page.reload()
  // 새로고침 — 첫 화면부터 이미 와 있다(출발점에서 날아오지 않는다)
  expect(await firstShipOffset(page)).toBeLessThan(1)

  // 같은 사무실 안의 변화는 그대로 비행한다 — 답이 달리면 날아가고, 다시 기다리는 글이 생기면 날아온다
  await setHr2Answered(page, true)
  await expect.poll(() => shipInScene(page), { timeout: 8_000 }).toBe(false)
  await setHr2Answered(page, false)
  expect(await firstShipOffset(page)).toBeGreaterThan(5)
})
