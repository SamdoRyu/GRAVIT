// 16. 도움 요청 (#183 — FR-LRN-15 ~ 19 · 21): 관리 패널 "도움 요청" 탭에서 쓰고, 남의 글에 코멘트하고(논의 중),
// 내 글을 해결로 닫거나 회의 안건으로 올린다. mock seed: 내 글 1건(48시간 지난 안건 후보, 이삼도 코멘트) · 박데브의 열린 글 ·
// 최하나의 해결된 글. 테스트마다 새 브라우저 저장소라 seed에서 시작한다.
import type { Page } from '@playwright/test'
import { expect, openApp, readStore, test } from './fixtures'

const MINE = /세션이 자꾸 끊겨요/
const OTHERS = /3D 상자를 끌면/

async function openHelpTab(page: Page) {
  await openApp(page, 'mock', { scene: false })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: /도움 요청/ }).click()
  return panel
}

/** Snapshot에서 내용으로 찾은 도움 요청의 상태 — 콜백은 브라우저에서 돌므로 찾을 글은 인자로 넘긴다 */
const helpStatus = (page: Page, match: string) =>
  page.evaluate(async (m) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const list = useOffice.getState().office.snapshot.helpRequests as { content: string; status: string }[]
    return list.find((h) => h.content.includes(m))?.status ?? null
  }, match)

test('write a help request: blank is rejected, then it is listed as open', async ({ page }) => {
  const panel = await openHelpTab(page)
  // seed 4건 — hr_4(강사 답변 있음)는 #290에서 더했다
  await expect(panel.getByRole('list', { name: '도움 요청 목록' }).getByRole('listitem')).toHaveCount(4)
  // 48시간이 지난 내 글은 안건 후보로 보인다
  await expect(panel.getByRole('button', { name: MINE })).toHaveClass(/is-candidate/)

  await panel.getByRole('button', { name: '도움 요청 쓰기' }).click()
  const form = panel.getByRole('form', { name: '도움 요청 쓰기' })
  await form.getByRole('textbox').fill('   ')
  await form.getByRole('button', { name: '올리기' }).click()
  await expect(form.getByRole('alert')).toHaveText('도움 요청은 1~2000자로 적어 주세요')
  await form.getByRole('textbox').fill('테스트 DB가 자꾸 잠겨요')
  await form.getByRole('button', { name: '올리기' }).click()
  await expect(page.getByText('도움 요청을 올렸어요')).toBeVisible()
  await expect(panel.getByRole('button', { name: /테스트 DB가 자꾸 잠겨요/ })).toContainText('열림')
  await expect.poll(() => helpStatus(page, '테스트 DB가')).toBe('open')
})

test('comment on someone else’s open request moves it to discussing', async ({ page }) => {
  const panel = await openHelpTab(page)
  await panel.getByRole('button', { name: OTHERS }).click()
  const detail = panel.getByRole('region', { name: '도움 요청 상세' })
  await expect(detail.getByText('아직 코멘트가 없어요.')).toBeVisible()
  // 남의 글에는 요청자 버튼이 없다
  await expect(detail.getByRole('button', { name: '해결로 닫기' })).toHaveCount(0)

  const form = detail.getByRole('form', { name: '코멘트 쓰기' })
  await form.getByRole('textbox').fill('드래그가 끝날 때 좌표를 확인해 보세요')
  await form.getByRole('button', { name: '코멘트 달기' }).click()
  await expect(detail.getByRole('list', { name: '코멘트' }).getByText('드래그가 끝날 때 좌표를 확인해 보세요')).toBeVisible()
  await expect(detail.locator('.help-head')).toContainText('논의 중')
  await expect.poll(() => helpStatus(page, '3D 상자를')).toBe('discussing')

  await detail.getByRole('button', { name: '목록' }).click()
  await expect(panel.getByRole('button', { name: OTHERS })).toContainText('코멘트 1')
})

test('close my request with the helpful comment and a learning', async ({ page }) => {
  const panel = await openHelpTab(page)
  await panel.getByRole('button', { name: MINE }).click()
  const detail = panel.getByRole('region', { name: '도움 요청 상세' })
  await expect(detail.getByText('48시간이 지나도록 해결되지 않아 안건 후보가 됐어요', { exact: false })).toBeVisible()

  await detail.getByRole('button', { name: '해결로 닫기' }).click()
  const form = detail.getByRole('form', { name: '해결로 닫기' })
  await form.getByRole('radio', { name: /이삼도/ }).check()
  await form.getByRole('button', { name: '해결로 닫기' }).click()
  await expect(form.getByRole('alert')).toHaveText('배운 점은 1~200자로 적어 주세요')
  await form.getByRole('textbox').fill('SameSite는 세션 쿠키 설정에서 바꾼다')
  await form.getByRole('button', { name: '해결로 닫기' }).click()

  await expect(page.getByText('해결로 닫았어요')).toBeVisible()
  await expect(detail.getByText('배운 점: SameSite는 세션 쿠키 설정에서 바꾼다')).toBeVisible()
  await expect(detail.getByText('도움이 됨')).toBeVisible()
  await expect(detail.getByRole('form', { name: '코멘트 쓰기' })).toHaveCount(0)
  // 닫힌 글은 강사가 답할 수 없어 "강사에게 요청"도 없다 (#272)
  await expect(detail.getByRole('button', { name: '강사에게 요청' })).toHaveCount(0)
  await expect.poll(() => helpStatus(page, '세션이 자꾸')).toBe('resolved')
})

test('confirm the 48-hour candidate as a meeting agenda item, then ask the instructor', async ({ page }) => {
  const panel = await openHelpTab(page)
  await panel.getByRole('button', { name: MINE }).click()
  const detail = panel.getByRole('region', { name: '도움 요청 상세' })

  await detail.getByRole('button', { name: '안건 후보 확정' }).click()
  const form = detail.getByRole('form', { name: '회의 안건으로 올리기' })
  // 첫 줄이 제목 초안이다
  await expect(form.getByRole('textbox')).toHaveValue(/세션이 자꾸 끊겨요/)
  await form.getByRole('button', { name: '회의실에 올리기' }).click()
  await expect(page.getByText('회의실 안건으로 올렸어요')).toBeVisible()
  await expect(detail.getByText('회의실 안건으로 올라갔어요', { exact: false })).toBeVisible()
  await expect.poll(() => helpStatus(page, '세션이 자꾸')).toBe('on_agenda')
  await expect
    .poll(() => readStore(page, (s) => (s.office.snapshot.agendaItems as { kind: string }[]).filter((a) => a.kind === 'help_request').length))
    .toBe(1)
  // 안건이 된 뒤에도 코멘트는 달 수 있다
  await expect(detail.getByRole('form', { name: '코멘트 쓰기' })).toBeVisible()

  await detail.getByRole('button', { name: '강사에게 요청' }).click()
  await expect(detail.getByText(/^강사에게 요청했어요/)).toBeVisible()
  await expect(detail.locator('.help-head')).toContainText('강사 요청')
})
