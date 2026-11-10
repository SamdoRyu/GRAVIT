// 20. 회고 (#209 — FR-LRN-08 · FR-REP-01 · 02 · 03 · 05, #335 · #336): 관리 패널 "회고" 탭에서 내 학습 타임라인을 보고, 회고 리포트를
// 만든다 — 제목 · 느낀 점(필수) · 넣을 기술 결정 카드. 느낀 점을 고치고, 마크다운으로 내보낸다. 보기 순서는 타임라인 → 카드 → 리포트.
// mock seed: 나(김옥토)의 PR #15가 받은 이유 2개(추천 · 비추천) · 머지된 #7(이유 없음, #218), 내 이슈 2개, 안건 없음, 카드 없음.
// 계산 규칙(정렬 · 페이지 · 익명화 순서 · 고른 카드 · 영역)은 계약 테스트(report.test.ts)가 맡는다. 강사 화면은 mock에 강사가 없어 ?source=api로 본다.
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openRetroTab(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '회고' }).click()
  return panel
}

test('my learning timeline lists the reasons my PR received — without who gave them; views go timeline → cards → report', async ({ page }) => {
  const panel = await openRetroTab(page)
  await expect(panel.getByRole('group', { name: '회고 보기' }).getByRole('button')).toHaveText(['학습 타임라인', '기술 결정 카드', '회고 리포트'])
  const timeline = panel.getByRole('list', { name: '학습 타임라인' })
  const items = timeline.getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('받은 평가')
  await expect(items.nth(0)).toContainText('#15 feat(auth): GitHub 로그인')
  await expect(items.nth(0)).toContainText('세션 만료 처리가 명확해요')
  await expect(items.nth(1)).toContainText('비추천')
  await expect(items.nth(1)).toContainText('실패 응답 모양이 계약과 달라요')
  // 평가자 · 다른 팀원 이름이 없고(FR-LRN-09), 학생에게는 다른 팀원을 고르는 칸이 없다
  for (const name of ['이삼도', '박데브', '최하나']) await expect(timeline).not.toContainText(name)
  await expect(panel.getByRole('combobox')).toHaveCount(0)
})

test('create a report with a title and what I felt, rewrite it, and export markdown with teammates anonymized', async ({ page }) => {
  const panel = await openRetroTab(page)
  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await expect(panel.getByText('아직 회고 리포트가 없어요')).toBeVisible()
  // 만들기 버튼은 하나 — 최종/중간을 고르지 않는다
  await expect(panel.getByRole('button', { name: /리포트 만들기$/ })).toHaveCount(1)

  await panel.getByRole('button', { name: '리포트 만들기' }).click()
  const create = panel.getByRole('form', { name: '회고 리포트 만들기' })
  await expect(create.getByRole('textbox', { name: /제목/ })).toHaveValue(/^회고 리포트 · \d+월 \d+일$/)
  await expect(create.getByText('아직 기술 결정 카드가 없어요', { exact: false })).toBeVisible()
  // 느낀 점은 필수
  await create.getByRole('button', { name: '만들기' }).click()
  await expect(create.getByRole('alert')).toHaveText('느낀 점은 1~5000자로 적어 주세요')
  await create.getByRole('textbox', { name: /제목/ }).fill('1차 스프린트 회고')
  await create.getByRole('textbox', { name: /느낀 점/ }).fill('이삼도에게 리뷰 받는 법을 배웠다')
  await create.getByRole('button', { name: '만들기' }).click()
  await expect(page.getByText('"1차 스프린트 회고" 리포트를 만들었어요')).toBeVisible()

  const report = panel.getByRole('article', { name: '회고 리포트: 1차 스프린트 회고' })
  await expect(report.getByRole('heading', { name: '1차 스프린트 회고' })).toBeVisible()
  // 요약은 없고, 담당 기능 영역은 고른 카드 기준 — 카드가 없으면 비어 있다
  await expect(report.getByRole('region', { name: '요약' })).toHaveCount(0)
  await expect(report.getByLabel('담당 기능 영역')).toContainText('담당 기능 영역 없음')
  await expect(report.getByRole('region', { name: '기술 결정 카드 0' })).toBeVisible()

  const form = report.getByRole('form', { name: '느낀 점 쓰기' })
  const learning = form.getByRole('textbox', { name: /느낀 점/ })
  await expect(learning).toHaveValue('이삼도에게 리뷰 받는 법을 배웠다')
  await expect(form.getByRole('button', { name: '저장' })).toBeDisabled()
  // 비울 수는 없다
  await learning.fill('')
  await expect(form.getByRole('alert')).toHaveText('느낀 점은 1~5000자로 적어 주세요')
  await expect(form.getByRole('button', { name: '저장' })).toBeDisabled()
  await learning.fill('이삼도에게 리뷰 받는 법을 배웠고, 계약을 먼저 읽는다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('느낀 점을 저장했어요')).toBeVisible()

  const downloading = page.waitForEvent('download')
  await report.getByRole('button', { name: '마크다운 내보내기' }).click()
  const file = await downloading
  expect(file.suggestedFilename()).toMatch(/^1차-스프린트-회고-\d{4}-\d{2}-\d{2}\.md$/)
  const markdown = await readFile(await file.path(), 'utf8')
  expect(markdown).toContain('# 1차 스프린트 회고')
  expect(markdown).toContain('## 느낀 점\n\n팀원 A에게 리뷰 받는 법을 배웠고')
  expect(markdown).not.toContain('이삼도')
  expect(markdown).not.toContain('## 요약')

  // 목록으로 돌아가면 제목으로 보이고, 다시 열면 느낀 점이 남아 있다
  await report.getByRole('button', { name: '리포트 목록' }).click()
  await panel.getByRole('list', { name: '회고 리포트 목록' }).getByRole('button', { name: /^1차 스프린트 회고 · / }).click()
  await expect(panel.getByRole('form', { name: '느낀 점 쓰기' }).getByRole('textbox')).toHaveValue('이삼도에게 리뷰 받는 법을 배웠고, 계약을 먼저 읽는다')
})
