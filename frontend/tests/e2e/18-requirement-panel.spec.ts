// 18. 요구사항 패널 (#197 — FR-REQ-04 · 05 · 06 · 07): 관리 패널 "요구사항" 탭. 문서에 있는 요구사항과 확인이 필요한
// 요구사항(missing · needs_review — 연결 보존)을 나눠 보이고, 연결된 이슈를 누르면 이슈 상세가 열린다. 연결 끊기는 R2만.
// mock seed: 팀 사무실(ws_1) — 김옥토는 참여자, 요구사항 7개. 시연 사무실(ws_2) — 김옥토가 R2, active 12개.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

async function openRequirementTab(page: Page) {
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: /^요구사항/ }).click()
  return panel
}

test('the requirement tab lists requirements by status with linked issues; a participant cannot unlink', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const panel = await openRequirementTab(page)
  await expect(panel.getByRole('tab', { name: /^요구사항/ })).toContainText('5')

  const active = panel.getByRole('list', { name: '문서에 있는 요구사항' })
  await expect(active.getByRole('listitem').filter({ has: page.locator('.req-title') })).toHaveCount(5)
  const ws = active.getByRole('listitem', { name: 'FR-WS-01 · 레포 선택 · 사무실 열기' })
  await expect(ws).toContainText('1/2 닫힘')
  await expect(ws.getByRole('list', { name: /연결된 이슈/ }).getByRole('listitem')).toHaveCount(2)
  await expect(active.getByRole('listitem', { name: 'FR-REQ-05 · 요구사항 진행률' })).toContainText('연결 없음')
  await expect(active.getByRole('listitem', { name: '동기화 상태 표시' })).toBeVisible() // 원본 ID 없음 — 제목만

  const others = panel.getByRole('list', { name: '확인이 필요한 요구사항' })
  await expect(others.getByRole('listitem', { name: 'FR-OLD-01 · 이메일 알림' })).toContainText('문서에서 사라짐')
  await expect(others.getByRole('listitem', { name: 'FR-REP-01 · 회고 리포트' })).toContainText('확인 필요')
  // 사라진 요구사항의 연결도 남아 있다
  await expect(others.getByRole('listitem', { name: 'FR-OLD-01 · 이메일 알림' })).toContainText('#12 PR 평가 입력')

  // 참여자는 연결을 바꿀 수 없다
  await expect(panel.getByRole('button', { name: /연결 끊기$/ })).toHaveCount(0)
  await expect(panel).toContainText('연결은 레포 관리자가 3D 요구사항 판에서 바꿔요.')

  // 연결된 이슈를 누르면 이슈 상세
  await ws.getByRole('button', { name: /#6 레포 선택 화면/ }).click()
  await expect.poll(() => readStore(page, (s) => s.officeSelection)).toEqual({ kind: 'task', id: 't_3' })
})

test('a repo admin unlinks an issue after confirming, and the progress updates', async ({ page }) => {
  await page.goto('/?workspace=ws_2')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  const panel = await openRequirementTab(page)
  const item = panel.getByRole('list', { name: '문서에 있는 요구사항' }).getByRole('listitem', { name: 'FR-DEMO-02 · 사무실 꾸미기' })
  await expect(item).toContainText('1/1 닫힘')

  // 한 번 더 확인 — 취소하면 그대로
  await item.getByRole('button', { name: /연결 끊기$/ }).click()
  await item.getByRole('group', { name: /연결 끊기 확인/ }).getByRole('button', { name: '취소' }).click()
  await expect(item).toContainText('1/1 닫힘')

  await item.getByRole('button', { name: /연결 끊기$/ }).click()
  await item.getByRole('group', { name: /연결 끊기 확인/ }).getByRole('button', { name: '끊기' }).click()
  await expect(page.getByText('연결을 끊었어요')).toBeVisible()
  await expect(item).toContainText('연결 없음')
  await expect(item.getByRole('list', { name: /연결된 이슈/ })).toHaveCount(0)
  expect(await readStore(page, (s) => s.office!.snapshot!.requirementLinks.some((l: { requirementId: string }) => l.requirementId === 'rq_22'))).toBe(false)
})

test('the waiting list swaps a waiting requirement onto a plate for this browser, and "기본 순서로" resets it', async ({ page }) => {
  await page.goto('/?workspace=ws_2')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  const panel = await openRequirementTab(page)
  // active 12개 — 판 9장 + 대기 칸 3개(3D와 같은 판 배치)
  await panel.getByRole('button', { name: '대기 중인 요구사항 3개 · 판 바꾸기' }).click()
  const dialog = page.getByRole('dialog', { name: '대기 중인 요구사항' })
  const waiting = dialog.getByRole('list', { name: '대기 중인 요구사항' })
  await expect(waiting.getByRole('listitem')).toHaveCount(3)
  await expect(dialog.getByRole('button', { name: '기본 순서로' })).toBeDisabled()

  const item = waiting.getByRole('listitem', { name: 'FR-DEMO-11 · 강사 피드백' })
  await item.getByRole('combobox').selectOption({ label: '3번 판 · FR-DEMO-03 · 첫 동기화' })
  await item.getByRole('button', { name: '판에 올리기' }).click()
  await expect(waiting.getByRole('listitem', { name: 'FR-DEMO-03 · 첫 동기화' })).toBeVisible()
  await expect(waiting.getByRole('listitem', { name: 'FR-DEMO-11 · 강사 피드백' })).toHaveCount(0)
  const order = ['rq_21', 'rq_22', 'rq_31', 'rq_24', 'rq_25', 'rq_26', 'rq_27', 'rq_28', 'rq_29']
  expect(await readStore(page, (s) => s.requirementDeckOrder)).toEqual(order)

  // 새로 고침해도 이 브라우저에는 남는다
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  expect(await readStore(page, (s) => s.requirementDeckOrder)).toEqual(order)

  await (await openRequirementTab(page)).getByRole('button', { name: /대기 중인 요구사항 3개/ }).click()
  await dialog.getByRole('button', { name: '기본 순서로' }).click()
  await expect(page.getByText('판을 기본 순서로 되돌렸어요')).toBeVisible()
  expect(await readStore(page, (s) => s.requirementDeckOrder)).toBeNull()
  await expect(waiting.getByRole('listitem', { name: 'FR-DEMO-11 · 강사 피드백' })).toBeVisible()
})

test('dropping an issue on the waiting plate opens the list to pick a requirement to link (repo admin)', async ({ page }) => {
  await page.goto('/?workspace=ws_2')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  // 3D 대기 칸에 이슈 상자를 놓았을 때 C가 부르는 액션
  await callStore(page, 'openRequirementWaiting', 't_12')
  const dialog = page.getByRole('dialog', { name: '연결할 요구사항 고르기' })
  await expect(dialog).toContainText('#2 시연: 사무실 꾸미기')
  await expect(dialog.getByRole('button', { name: '기본 순서로' })).toHaveCount(0)
  await dialog.getByRole('listitem', { name: 'FR-DEMO-10 · 회고 리포트' }).getByRole('button', { name: '이 요구사항에 연결' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('FR-DEMO-10 · 회고 리포트에 연결했어요')).toBeVisible()
  expect(await readStore(page, (s) => s.office!.snapshot!.requirementLinks.some((l: { requirementId: string; taskId: string }) => l.requirementId === 'rq_30' && l.taskId === 't_12'))).toBe(true)
  expect(await readStore(page, (s) => s.office!.snapshot!.requirements.find((r: { id: string }) => r.id === 'rq_30')!.linkedTaskCount)).toBe(1)
})
