// 34. 강사 우주선 · 새 강사 답변 점 (#290).
// - 우주선: "강사에게 요청"한 열린 도움 요청에 강사 답변이 없는 동안 강사 라코가 차 우주선을 타고 게시판 위에 와 있고, 강사 답변이
//   달리면 날아간다. mock에는 강사 계정이 없어 강사 답변은 store의 확인 결과를 "답변 있음"으로 바꿔 흉내 낸다.
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
