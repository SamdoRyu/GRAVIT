// 20. 회고 (#209 — FR-LRN-08 · FR-REP-01 · 02 · 03 · 05): 관리 패널 "회고" 탭에서 내 학습 타임라인을 보고, 회고 리포트를 만들고,
// "내가 배운 점"을 쓰고, 마크다운으로 내보낸다. mock seed: 나(김옥토)의 PR #15가 받은 이유 2개(추천 · 비추천), 내 이슈 2개, 안건 없음.
// 계산 규칙(정렬 · 페이지 · 익명화 순서)은 계약 테스트(report.test.ts)가 맡는다. 강사 화면은 mock에 강사가 없어 ?source=api로 본다.
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openRetroTab(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '회고' }).click()
  return panel
}

test('my learning timeline lists the reasons my PR received — without who gave them', async ({ page }) => {
  const panel = await openRetroTab(page)
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

test('create a final report, write what I learned, and export markdown with teammates anonymized', async ({ page }) => {
  const panel = await openRetroTab(page)
  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await expect(panel.getByText('아직 회고 리포트가 없어요')).toBeVisible()

  await panel.getByRole('button', { name: '최종 리포트 만들기' }).click()
  await expect(page.getByText('최종 회고 리포트를 만들었어요')).toBeVisible()
  const report = panel.getByRole('article', { name: '최종 회고 리포트' })
  await expect(report.getByRole('region', { name: '요약' })).toContainText('맡은 이슈 2개(닫힘 0) · 작성한 PR 1개(머지 0) · 올린 안건 0건(결론 0)')
  await expect(report.getByRole('list', { name: '담당 기능 영역' }).getByRole('listitem')).toHaveText(['auth', 'workspace'])

  const form = report.getByRole('form', { name: '내가 배운 점 쓰기' })
  await form.getByRole('textbox', { name: /내가 배운 점/ }).fill('이삼도에게 리뷰 받는 법을 배웠다')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('내가 배운 점을 저장했어요')).toBeVisible()
  await expect(form.getByRole('textbox', { name: /내가 배운 점/ })).toHaveValue('이삼도에게 리뷰 받는 법을 배웠다')
  await expect(form.getByRole('button', { name: '저장' })).toBeDisabled()

  const downloading = page.waitForEvent('download')
  await report.getByRole('button', { name: '마크다운 내보내기' }).click()
  const file = await downloading
  expect(file.suggestedFilename()).toMatch(/^최종-회고-리포트-\d{4}-\d{2}-\d{2}\.md$/)
  const markdown = await readFile(await file.path(), 'utf8')
  expect(markdown).toContain('# 최종 회고 리포트')
  expect(markdown).toContain('팀원 A에게 리뷰 받는 법을 배웠다')
  expect(markdown).not.toContain('이삼도')

  // 목록으로 돌아가면 방금 만든 리포트가 있고, 다시 열면 배운 점이 남아 있다
  await report.getByRole('button', { name: '리포트 목록' }).click()
  await panel.getByRole('list', { name: '회고 리포트 목록' }).getByRole('button', { name: /^최종 회고 리포트/ }).click()
  await expect(panel.getByRole('form', { name: '내가 배운 점 쓰기' }).getByRole('textbox')).toHaveValue('이삼도에게 리뷰 받는 법을 배웠다')
})
