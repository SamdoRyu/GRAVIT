// 27. 더보기 메뉴는 상세 카드 위에 뜬다 (#235): 드로어(<= 1100px)로 이슈 상세가 열린 채 상단 바 더보기를 열어도
// 상세 카드와 겹치는 메뉴 항목("강사")을 누를 수 있다. 리허설 때 1037×683에서 상세 레일이 클릭을 가로챘다.
import { callStore, expect, openApp, readStore, test } from './fixtures'

test.use({ viewport: { width: 1037, height: 683 } })

test('the more menu stays clickable over an open issue detail', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const taskId = await readStore(page, (s) => s.office.snapshot.tasks[0].id)
  await callStore(page, 'selectInOffice', { kind: 'task', id: taskId })
  await expect(page.locator('.rail .detail')).toBeVisible()

  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '강사' }).click() // 가로채이면 여기서 시간 초과
  await expect(page.getByRole('dialog', { name: '강사' })).toBeVisible()
})
