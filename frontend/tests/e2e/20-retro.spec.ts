// 20. 회고 (#209 — FR-LRN-08 · FR-REP-01 · 02 · 03 · 05, #335 · #336 · #342): 관리 패널 "회고" 탭에서 내 학습 타임라인을 보고, 회고
// 리포트를 만든다 — 1단계 제목 · 넣을 기술 결정 카드 → 2단계 느낀 점(필수). 저장 버튼은 없고 「마크다운 내보내기」가 저장(만들기 ·
// 고친 느낀 점)한 뒤 내려받는다. 보기 순서는 타임라인 → 카드 → 리포트.
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

test('create a report in two steps — cards, then what I felt — and markdown export saves it to the list with teammates anonymized', async ({ page }) => {
  const panel = await openRetroTab(page)
  await panel.getByRole('button', { name: '회고 리포트', exact: true }).click()
  await expect(panel.getByText('아직 회고 리포트가 없어요')).toBeVisible()
  // 만들기 버튼은 하나 — 최종/중간을 고르지 않는다
  await expect(panel.getByRole('button', { name: /리포트 만들기$/ })).toHaveCount(1)

  // 1단계: 제목 · 카드만. 느낀 점 칸 · 저장 버튼은 없다. 제목이 비면 다음으로 못 간다
  await panel.getByRole('button', { name: '리포트 만들기' }).click()
  const create = panel.getByRole('form', { name: '회고 리포트 만들기' })
  await expect(create.getByRole('textbox', { name: /제목/ })).toHaveValue(/^회고 리포트 · \d+월 \d+일$/)
  await expect(create.getByText('아직 기술 결정 카드가 없어요', { exact: false })).toBeVisible()
  await expect(create.getByRole('textbox', { name: /느낀 점/ })).toHaveCount(0)
  await expect(create.getByRole('button', { name: '저장' })).toHaveCount(0)
  await create.getByRole('textbox', { name: /제목/ }).fill('')
  await create.getByRole('button', { name: '다음' }).click()
  await expect(create.getByRole('alert')).toHaveText('제목은 1~100자로 적어 주세요')
  await create.getByRole('textbox', { name: /제목/ }).fill('1차 스프린트 회고')
  await create.getByRole('button', { name: '다음' }).click()

  // 2단계: 느낀 점(필수) · 저장 안내. 이전으로 돌아가도 1단계 값이 남는다
  await expect(create.getByLabel('고른 내용')).toHaveText('1차 스프린트 회고 · 넣을 기술 결정 카드 없음')
  await expect(create.getByText('「마크다운 내보내기」를 누르면 리포트 목록에 저장되고 마크다운 파일도 받아요')).toBeVisible()
  await create.getByRole('button', { name: '이전' }).click()
  await expect(create.getByRole('textbox', { name: /제목/ })).toHaveValue('1차 스프린트 회고')
  await create.getByRole('button', { name: '다음' }).click()
  await create.getByRole('button', { name: '마크다운 내보내기' }).click()
  await expect(create.getByRole('alert')).toHaveText('느낀 점은 1~5000자로 적어 주세요')
  await create.getByRole('textbox', { name: /느낀 점/ }).fill('이삼도에게 리뷰 받는 법을 배웠다')

  // 내보내기 = 목록에 저장 + 내려받기 + 알림, 그리고 리포트 목록으로 돌아간다
  let downloading = page.waitForEvent('download')
  await create.getByRole('button', { name: '마크다운 내보내기' }).click()
  let file = await downloading
  expect(file.suggestedFilename()).toMatch(/^1차-스프린트-회고-\d{4}-\d{2}-\d{2}\.md$/)
  let markdown = await readFile(await file.path(), 'utf8')
  expect(markdown).toContain('# 1차 스프린트 회고')
  expect(markdown).toContain('## 느낀 점\n\n팀원 A에게 리뷰 받는 법을 배웠다')
  expect(markdown).not.toContain('이삼도')
  expect(markdown).not.toContain('## 요약')
  await expect(page.getByText('"1차 스프린트 회고" 리포트를 목록에 저장하고 마크다운 파일로 내보냈어요', { exact: false })).toBeVisible()
  await expect(create).toHaveCount(0)
  const list = panel.getByRole('list', { name: '회고 리포트 목록' })
  await expect(list.getByRole('button')).toHaveCount(1)
  await list.getByRole('button', { name: /^1차 스프린트 회고 · / }).click()

  const report = panel.getByRole('article', { name: '회고 리포트: 1차 스프린트 회고' })
  await expect(report.getByRole('heading', { name: '1차 스프린트 회고' })).toBeVisible()
  // 요약은 없고, 담당 기능 영역은 고른 카드 기준 — 카드가 없으면 비어 있다
  await expect(report.getByRole('region', { name: '요약' })).toHaveCount(0)
  await expect(report.getByLabel('담당 기능 영역')).toContainText('담당 기능 영역 없음')
  await expect(report.getByRole('region', { name: '기술 결정 카드 0' })).toBeVisible()

  // 상세: 저장 버튼 없이 느낀 점을 고치고, 내보내기가 고친 느낀 점을 저장한 뒤 내려받는다
  const learningSection = report.getByRole('region', { name: '느낀 점' })
  const learning = learningSection.getByRole('textbox', { name: /느낀 점/ })
  await expect(learning).toHaveValue('이삼도에게 리뷰 받는 법을 배웠다')
  await expect(report.getByRole('button', { name: '저장' })).toHaveCount(0)
  await expect(learningSection.getByText('「마크다운 내보내기」를 누르면 고친 느낀 점이 저장돼요')).toBeVisible()
  // 비우면 저장 · 내보내기를 하지 않는다
  await learning.fill('')
  await expect(learningSection.getByRole('alert')).toHaveText('느낀 점은 1~5000자로 적어 주세요')
  await expect(report.getByRole('button', { name: '마크다운 내보내기' })).toBeDisabled()
  await learning.fill('이삼도에게 리뷰 받는 법을 배웠고, 계약을 먼저 읽는다')
  downloading = page.waitForEvent('download')
  await report.getByRole('button', { name: '마크다운 내보내기' }).click()
  file = await downloading
  markdown = await readFile(await file.path(), 'utf8')
  expect(markdown).toContain('## 느낀 점\n\n팀원 A에게 리뷰 받는 법을 배웠고, 계약을 먼저 읽는다')
  await expect(page.getByText('느낀 점을 저장하고 마크다운 파일로 내보냈어요', { exact: false })).toBeVisible()

  // 목록으로 돌아가도 리포트는 하나이고, 다시 열면 고친 느낀 점이 남아 있다
  await report.getByRole('button', { name: '리포트 목록' }).click()
  await expect(list.getByRole('button')).toHaveCount(1)
  await list.getByRole('button', { name: /^1차 스프린트 회고 · / }).click()
  await expect(panel.getByRole('region', { name: '느낀 점' }).getByRole('textbox')).toHaveValue('이삼도에게 리뷰 받는 법을 배웠고, 계약을 먼저 읽는다')
})
