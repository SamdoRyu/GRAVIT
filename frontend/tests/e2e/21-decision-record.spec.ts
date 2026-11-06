// 21. 결정 기록 (#212 — FR-LRN-22 · FR-MTG-04 · FR-LRN-05 · 12): 관리 패널 "결정 기록" 탭에서 회의에서 정한 결정을 보고, 팀원이
// 강사 피드백을 요청한다. 안건 · 결정은 store로 만든다(회의 대화상자 흐름은 06-agenda-meeting). 강사가 피드백을 쓰는 화면은
// mock에 강사 계정이 없어 ?source=api로 확인한다.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

const agenda = (title: string) => ({ kind: 'learning', sourceId: null, title, background: null, tried: null, unresolvedReason: null })

/** 안건 둘 — 하나는 결정까지(더 알아볼 사람 이삼도 m_2), 하나는 결정 전 */
async function seedDecisions(page: Page) {
  await openApp(page, 'mock', { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const decided = (await callStore<{ id: string }>(page, 'raiseAgendaItem', agenda('E2E 테스트 전략')))!.id
  await callStore(page, 'raiseAgendaItem', agenda('E2E 아직 결정 전'))
  await callStore(page, 'recordAgendaDecision', decided, {
    conclusion: '규칙은 순수 함수로 시험한다',
    learning: '화면 테스트는 흐름만 본다',
    prDecision: null,
    followUpAssigneeMemberId: 'm_2',
    followUpDueDate: null,
    meetingId: null,
  })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: '결정 기록' }).click()
  return { panel, decided }
}

test('the decision tab lists only decided agenda items, with the decision in detail', async ({ page }) => {
  const { panel } = await seedDecisions(page)
  const list = panel.getByRole('list', { name: '결정 기록 목록' })
  await expect(list.getByRole('button')).toHaveCount(1)
  await expect(list).not.toContainText('E2E 아직 결정 전')

  await list.getByRole('button', { name: '결정 기록: E2E 테스트 전략' }).click()
  const detail = panel.getByRole('article', { name: '결정 기록: E2E 테스트 전략' })
  await expect(detail).toContainText('규칙은 순수 함수로 시험한다')
  await expect(detail).toContainText('화면 테스트는 흐름만 본다')
  await expect(detail).toContainText('이삼도')
  await expect(detail.getByText('강사 피드백 0')).toBeVisible()
  // 팀원 화면에는 강사 피드백 쓰기 폼이 없다
  await expect(detail.getByRole('form', { name: '강사 피드백 쓰기' })).toHaveCount(0)
})

test('a teammate requests instructor feedback — the record shows it as requested and its decision stays the same', async ({ page }) => {
  const { panel, decided } = await seedDecisions(page)
  await panel.getByRole('button', { name: '결정 기록: E2E 테스트 전략' }).click()
  const detail = panel.getByRole('article', { name: '결정 기록: E2E 테스트 전략' })
  await detail.getByRole('button', { name: '강사 피드백 요청' }).click()
  await expect(page.getByText('강사 피드백을 요청했어요').first()).toBeVisible()
  await expect(detail.getByRole('status')).toContainText('강사 피드백을 요청했어요')
  await expect(detail.getByRole('button', { name: '강사 피드백 요청' })).toHaveCount(0)

  const item = await readStore(page, (s) => {
    const a = s.office.snapshot.agendaItems.find((x: { title: string }) => x.title === 'E2E 테스트 전략')
    return { id: a.id, status: a.status, requested: a.feedbackRequested, conclusion: a.decision.conclusion }
  })
  expect(item).toEqual({ id: decided, status: 'discussed', requested: true, conclusion: '규칙은 순수 함수로 시험한다' })

  await detail.getByRole('button', { name: '결정 기록 목록' }).click()
  await expect(panel.getByRole('button', { name: '결정 기록: E2E 테스트 전략' })).toContainText('피드백 요청됨')
})
