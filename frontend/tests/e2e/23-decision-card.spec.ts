// 23. 기술 결정 카드 (#218 — FR-REP-07 · 10 · 11): 관리 패널 "회고" 탭의 "기술 결정 카드"에서 머지된 내 PR로 카드를 만들고,
// 칸을 고치고, 배운 점을 써서 확인하고, 강사 꼬리질문을 요청한다. 확인한 카드는 회고 리포트에 들어간다.
// mock seed: 나(김옥토)의 머지된 PR #7(레포 선택 목록 — 이슈 #6 · 요구사항 "레포 선택 · 사무실 열기")과 열린 PR #15.
// 9칸 채우기 규칙은 계약 테스트(decisionCard.test.ts)가 맡는다. 강사 꼬리질문 쓰기는 mock에 강사가 없어 ?source=api로 본다.
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openCards(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '회고' }).click()
  await panel.getByRole('button', { name: '기술 결정 카드', exact: true }).click()
  return panel
}

test('make a card from my merged PR — cells come from the app’s materials, then confirm it with what I learned', async ({ page }) => {
  const panel = await openCards(page)
  await expect(panel.getByText('아직 기술 결정 카드가 없어요')).toBeVisible()
  // 머지되거나 닫힌 내 PR만 고를 수 있다 — 열린 #15는 없다
  const create = panel.getByRole('form', { name: '기술 결정 카드 만들기' })
  await expect(create.getByRole('option')).toHaveText(['#7 feat(workspace): 레포 선택 목록 · 머지됨'])

  await create.getByRole('button', { name: '카드 만들기' }).click()
  await expect(page.getByText('기술 결정 카드를 만들었어요', { exact: false })).toBeVisible()
  const card = panel.getByRole('article', { name: '기술 결정 카드: #7 feat(workspace): 레포 선택 목록' })
  const form = card.getByRole('form', { name: '카드 고치기' })
  // 재료가 있는 칸만 채워진다 — 목표 = 연결 이슈의 요구사항, 원본 = PR · 이슈 링크
  await expect(form.getByRole('textbox', { name: /무엇을 하려 했나/ })).toHaveValue('레포 선택 · 사무실 열기')
  await expect(form.getByRole('textbox', { name: /원본/ })).toHaveValue(/\/pull\/7\n.*\/issues\/6$/)
  await expect(form.getByRole('textbox', { name: /처음 택한 방법/ })).toHaveValue('')
  await expect(form.getByRole('textbox', { name: /내가 배운 점/ })).toHaveValue('')

  // 배운 점 없이 확인할 수는 없다
  await form.getByRole('checkbox').check()
  await expect(form.getByRole('alert')).toHaveText('확인하려면 내가 배운 점을 써 주세요')
  await expect(form.getByRole('button', { name: '저장' })).toBeDisabled()
  await form.getByRole('textbox', { name: /처음 택한 방법/ }).fill('레포 목록을 한 번에 다 읽었다')
  await form.getByRole('textbox', { name: /내가 배운 점/ }).fill('목록은 페이지로 나눠 읽는다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('카드를 확인했어요', { exact: false })).toBeVisible()
  await expect(card.locator('.help-head')).toContainText('확인함')

  // 강사 꼬리질문 요청 → 요청됨 표시, 버튼은 사라진다
  await card.getByRole('button', { name: '강사 꼬리질문 요청' }).click()
  await expect(card.getByText(/^강사에게 꼬리질문을 요청했어요/)).toBeVisible()
  await expect(card.getByRole('button', { name: '강사 꼬리질문 요청' })).toHaveCount(0)
  // 학생에게는 꼬리질문 쓰기 폼이 없다
  await expect(card.getByRole('form', { name: '꼬리질문 쓰기' })).toHaveCount(0)

  await card.getByRole('button', { name: '카드 목록' }).click()
  const item = panel.getByRole('list', { name: '기술 결정 카드 목록' }).getByRole('button', { name: /#7 feat\(workspace\)/ })
  await expect(item).toContainText('확인함')
  await expect(item).toContainText('꼬리질문 요청')
  // 같은 PR로는 한 장뿐 — 만들 PR이 더 없다
  await expect(panel.getByText('카드를 만들 수 있는 PR이 없어요', { exact: false })).toBeVisible()
})

test('a confirmed card appears in my retro report; a draft does not', async ({ page }) => {
  const panel = await openCards(page)
  await panel.getByRole('form', { name: '기술 결정 카드 만들기' }).getByRole('button', { name: '카드 만들기' }).click()
  const form = panel.getByRole('form', { name: '카드 고치기' })
  await form.getByRole('textbox', { name: /내가 배운 점/ }).fill('목록은 페이지로 나눠 읽는다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('카드를 저장했어요')).toBeVisible()

  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await panel.getByRole('button', { name: '최종 리포트 만들기' }).click()
  const report = panel.getByRole('article', { name: '최종 회고 리포트' })
  await expect(report.getByRole('region', { name: '확인한 기술 결정 카드 0' })).toBeVisible()

  // 카드를 확인하면 리포트에 들어간다(리포트는 읽을 때 계산)
  await panel.getByRole('button', { name: '기술 결정 카드', exact: true }).click()
  await panel.getByRole('list', { name: '기술 결정 카드 목록' }).getByRole('button', { name: /#7/ }).click()
  await panel.getByRole('form', { name: '카드 고치기' }).getByRole('checkbox').check()
  await panel.getByRole('form', { name: '카드 고치기' }).getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('카드를 확인했어요', { exact: false })).toBeVisible()

  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await panel.getByRole('list', { name: '회고 리포트 목록' }).getByRole('button').first().click()
  const cards = panel.getByRole('article', { name: '최종 회고 리포트' }).getByRole('list', { name: '확인한 기술 결정 카드' })
  await expect(cards.getByRole('listitem')).toHaveCount(1)
  await expect(cards).toContainText('목록은 페이지로 나눠 읽는다')
})
