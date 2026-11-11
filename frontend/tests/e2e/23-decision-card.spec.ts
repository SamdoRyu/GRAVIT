// 23. 기술 결정 카드 (#218 — FR-REP-07 · 10 · 11, #335 · #336): 관리 패널 "회고" 탭의 "기술 결정 카드"에서 머지된 내 PR로 카드를 만들고,
// 칸을 고쳐 저장하고, 강사 꼬리질문을 요청한다. 「확인함」 단계는 없다 — 「내가 배운 점」을 쓴 카드는 회고 리포트를 만들 때 고를 수 있다.
// mock seed: 나(김옥토)의 머지된 PR #7(레포 선택 목록 — 이슈 #6 · 요구사항 "레포 선택 · 사무실 열기", area:workspace)과 열린 PR #15.
// 9칸 채우기 규칙은 계약 테스트(decisionCard.test.ts)가 맡는다. 강사 꼬리질문 쓰기는 mock에 강사가 없어 ?source=api로 본다.
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openCards(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '회고' }).click()
  await panel.getByRole('button', { name: '기술 결정 카드', exact: true }).click()
  return panel
}

test('make a card from my merged PR — cells come from the app’s materials; saving with what I learned makes it ready for a report', async ({ page }) => {
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
  // 「확인함」 체크박스는 없다 — 배운 점이 비어 있다는 표시만
  await expect(form.getByRole('checkbox')).toHaveCount(0)
  await expect(card.locator('.help-head')).toContainText('배운 점 비어 있음')

  await form.getByRole('textbox', { name: /처음 택한 방법/ }).fill('레포 목록을 한 번에 다 읽었다')
  await form.getByRole('textbox', { name: /내가 배운 점/ }).fill('목록은 페이지로 나눠 읽는다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('카드를 저장했어요 — 회고 리포트를 만들 때 고를 수 있어요')).toBeVisible()
  await expect(card.locator('.help-head')).toContainText('리포트에 넣을 수 있음')

  // 강사 꼬리질문 요청 → 요청됨 표시, 버튼은 사라진다
  await card.getByRole('button', { name: '강사 꼬리질문 요청' }).click()
  await expect(card.getByText(/^강사에게 꼬리질문을 요청했어요/)).toBeVisible()
  await expect(card.getByRole('button', { name: '강사 꼬리질문 요청' })).toHaveCount(0)
  // 학생에게는 꼬리질문 쓰기 폼이 없다
  await expect(card.getByRole('form', { name: '꼬리질문 쓰기' })).toHaveCount(0)

  await card.getByRole('button', { name: '카드 목록' }).click()
  const item = panel.getByRole('list', { name: '기술 결정 카드 목록' }).getByRole('button', { name: /#7 feat\(workspace\)/ })
  await expect(item).toContainText('리포트에 넣을 수 있음')
  await expect(item).toContainText('꼬리질문 요청')
  // 같은 PR로는 한 장뿐 — 만들 PR이 더 없다
  await expect(panel.getByText('카드를 만들 수 있는 PR이 없어요', { exact: false })).toBeVisible()
})

test('only cards with what I learned can be picked for a report; the picked card shows in it by PR', async ({ page }) => {
  const panel = await openCards(page)
  await panel.getByRole('form', { name: '기술 결정 카드 만들기' }).getByRole('button', { name: '카드 만들기' }).click()
  await expect(page.getByText('기술 결정 카드를 만들었어요', { exact: false })).toBeVisible()

  // 배운 점이 빈 카드는 고를 수 없다
  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await panel.getByRole('button', { name: '리포트 만들기' }).click()
  let create = panel.getByRole('form', { name: '회고 리포트 만들기' })
  const pick = () => create.getByRole('list', { name: '넣을 기술 결정 카드' }).getByRole('checkbox', { name: '#7 feat(workspace): 레포 선택 목록' })
  await expect(pick()).toBeDisabled()
  await expect(create.getByText('배운 점을 쓰면 고를 수 있어요')).toBeVisible()
  await create.getByRole('button', { name: '취소' }).click()

  // 배운 점을 쓰고 저장하면 고를 수 있다
  await panel.getByRole('button', { name: '기술 결정 카드', exact: true }).click()
  await panel.getByRole('list', { name: '기술 결정 카드 목록' }).getByRole('button', { name: /#7/ }).click()
  const form = panel.getByRole('form', { name: '카드 고치기' })
  await form.getByRole('textbox', { name: /내가 배운 점/ }).fill('목록은 페이지로 나눠 읽는다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('카드를 저장했어요', { exact: false })).toBeVisible()

  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await panel.getByRole('button', { name: '리포트 만들기' }).click()
  create = panel.getByRole('form', { name: '회고 리포트 만들기' })
  await expect(pick()).toBeEnabled()
  await pick().check()
  await create.getByRole('textbox', { name: /제목/ }).fill('레포 선택 회고')
  await create.getByRole('button', { name: '다음' }).click()
  // 2단계 미리보기에 고른 카드의 내용이 저장 전부터 보인다
  const previewCards = create.getByRole('list', { name: '기술 결정 카드' })
  await expect(previewCards.getByRole('listitem')).toHaveCount(1)
  await expect(previewCards).toContainText('#7 feat(workspace): 레포 선택 목록')
  await expect(previewCards).toContainText('목록은 페이지로 나눠 읽는다')
  await create.getByRole('textbox', { name: /느낀 점/ }).fill('페이지 나누기를 먼저 정했어야 했다')
  const downloading = page.waitForEvent('download')
  await create.getByRole('button', { name: '마크다운 내보내기' }).click()
  // 담당 기능 영역은 화면에 없고 마크다운에 남는다 — 고른 카드의 PR · 연결 이슈 기준(FR-REP-01)
  const markdown = await readFile(await (await downloading).path(), 'utf8')
  expect(markdown).toContain('## 담당 기능 영역\n\n- area:workspace')
  await panel.getByRole('list', { name: '회고 리포트 목록' }).getByRole('button', { name: /^레포 선택 회고 · / }).click()

  const report = panel.getByRole('article', { name: '회고 리포트: 레포 선택 회고' })
  await expect(report.getByLabel('담당 기능 영역')).toHaveCount(0)
  const cards = report.getByRole('list', { name: '기술 결정 카드' })
  await expect(cards.getByRole('listitem')).toHaveCount(1)
  await expect(cards).toContainText('#7 feat(workspace): 레포 선택 목록')
  await expect(cards).toContainText('목록은 페이지로 나눠 읽는다')
})
