// 17. 스탠드업 (#190 — FR-MTG-01 · 02 · FR-LRN-15): 관리 패널 "스탠드업" 탭에서 날짜별 스탠드업을 보고, 내 것을 쓰고,
// 저장한 "막힌 것"을 도움 요청으로 넘긴다. mock seed: 오늘 이삼도 · 박데브(막힌 것 있음), 어제 나(김옥토). 오늘 내 것은 없다.
// 미리 채우기 결과는 seed 시각에 따라 달라 계약 테스트(standup.test.ts)가 맡는다.
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openStandupTab(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '스탠드업' }).click()
  await expect(panel.getByRole('list', { name: '팀원 스탠드업' })).toBeVisible()
  return panel
}

test('today shows each teammate’s standup, and earlier days are one click back', async ({ page }) => {
  const panel = await openStandupTab(page)
  const list = panel.getByRole('list', { name: '팀원 스탠드업' })
  await expect(list.getByRole('listitem', { name: '이삼도의 스탠드업' })).toContainText('레포 선택 화면 리뷰')
  await expect(list.getByRole('listitem', { name: '박데브의 스탠드업' })).toContainText('막힌 것 상자를 끌면 가끔 책상 밖으로 튀어요')
  await expect(list.getByRole('listitem', { name: '김옥토의 스탠드업' })).toContainText('아직 안 썼어요')
  await expect(panel.getByRole('button', { name: '다음 날' })).toBeDisabled()

  await panel.getByRole('button', { name: '이전 날' }).click()
  await expect(list.getByRole('listitem', { name: '김옥토의 스탠드업' })).toContainText('로그인 화면 마무리')
  await expect(list.getByRole('listitem', { name: '이삼도의 스탠드업' })).toContainText('아직 안 썼어요')
  await panel.getByRole('button', { name: '오늘로' }).click()
  await expect(list.getByRole('listitem', { name: '이삼도의 스탠드업' })).toContainText('레포 선택 화면 리뷰')
})

test('write my standup, then turn the saved blocker into a help request', async ({ page }) => {
  const panel = await openStandupTab(page)
  const form = panel.getByRole('form', { name: '내 스탠드업' })
  await form.getByRole('textbox', { name: /어제 한 일/ }).fill('도움 요청 화면을 붙였어요')
  await form.getByRole('textbox', { name: /막힌 것/ }).fill('?source=api에서 세션이 끊겨요')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('스탠드업을 저장했어요')).toBeVisible()
  const mine = panel.getByRole('list', { name: '팀원 스탠드업' }).getByRole('listitem', { name: '김옥토의 스탠드업' })
  await expect(mine).toContainText('도움 요청 화면을 붙였어요')
  await expect(mine).toContainText('?source=api에서 세션이 끊겨요')

  // 저장한 "막힌 것" → 도움 요청 쓰기 폼(내용 · 스탠드업이 채워짐) → 올리기
  await panel.getByRole('button', { name: '막힌 것을 도움 요청으로' }).click()
  await expect(panel.getByRole('tab', { name: /도움 요청/ })).toHaveAttribute('aria-selected', 'true')
  const compose = panel.getByRole('form', { name: '도움 요청 쓰기' })
  await expect(compose.getByRole('textbox')).toHaveValue('?source=api에서 세션이 끊겨요')
  await expect(compose.getByText('스탠드업의 "막힌 것"에서 넘어왔어요')).toBeVisible()
  await compose.getByRole('button', { name: '올리기' }).click()
  await expect(page.getByText('도움 요청을 올렸어요')).toBeVisible()
  const fromStandup = await page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const list = useOffice.getState().office.snapshot.helpRequests as { content: string; fromStandupId: string | null }[]
    return list.find((h) => h.content.includes('세션이 끊겨요') && h.fromStandupId !== null)?.fromStandupId ?? null
  })
  expect(fromStandup).not.toBeNull()
})
