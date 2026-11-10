// 35. 도움 요청 안건 철회 뒤 카드 복구 (#314 — FR-LRN-14 · 19, 서버 #313): 도움 요청에서 만든 안건을 회의실 쓰레기통이나
// 회의 시작 대화상자의 "안건 거두기"로 철회하면 안건만 거둬지고, 도움 요청은 안건으로 올리기 직전 상태로 돌아온다.
// 상단 라벨 · 하단 버튼은 되돌아온 서버 값(status · isAgendaCandidate · instructorRequested)과 기존 표시 조건대로 다시 보인다.
// mock seed의 내 글(hr_1)이 기준 사례다: 「논의 중」 · 만든 지 48시간 지남(「안건 후보」) · 강사에게 요청 안 함 · 이삼도 코멘트 1개.
import type { Page } from '@playwright/test'
import { dropOnTrash, runtime } from './agendaTrash'
import { callStore, expect, openApp, readStore, test, waitForScene } from './fixtures'

const MINE = /세션이 자꾸 끊겨요/
const SEED_COMMENT = 'application.yaml의 server.servlet.session.cookie.same-site를 확인해 보세요'

async function raiseMine(page: Page, title: string): Promise<string> {
  const item = await callStore<{ id: string } | null>(page, 'convertHelpRequestToAgenda', 'hr_1', title)
  expect(item).not.toBeNull()
  return item!.id
}

async function openMine(page: Page) {
  const panel = page.getByRole('region', { name: '관리 패널' })
  await panel.getByRole('tab', { name: /도움 요청/ }).click()
  await panel.getByRole('button', { name: MINE }).click()
  return panel.getByRole('region', { name: '도움 요청 상세' })
}

/** 기준 사례의 복구된 모습 — 라벨 「논의 중」 · 「안건 후보」, 버튼 「강사에게 요청」 · 「안건 후보 확정」 · 「해결로 닫기」, 본문 · 코멘트 그대로 */
async function expectRestored(page: Page) {
  const detail = await openMine(page)
  const head = detail.locator('.help-head')
  await expect(head).toContainText('논의 중')
  await expect(head).toContainText('안건 후보')
  await expect(head).not.toContainText('회의 안건')
  await expect(detail.getByText('회의실 안건으로 올라갔어요', { exact: false })).toHaveCount(0)
  await expect(detail.getByText('48시간이 지나도록 해결되지 않아 안건 후보가 됐어요', { exact: false })).toBeVisible()
  await expect(detail.getByRole('button', { name: '강사에게 요청' })).toBeVisible()
  await expect(detail.getByRole('button', { name: '안건 후보 확정' })).toBeVisible()
  await expect(detail.getByRole('button', { name: '해결로 닫기' })).toBeVisible()
  await expect(detail.getByText(MINE)).toBeVisible()
  await expect(detail.getByRole('list', { name: '코멘트' }).getByText(SEED_COMMENT)).toBeVisible()
  return detail
}

test('withdrawing a help-request agenda item at the trash can brings the card back as it was; it survives a reload and can be raised again', async ({ page }) => {
  await openApp(page, 'mock')
  const first = await raiseMine(page, 'E2E 도움 요청 안건')
  await expect.poll(() => readStore(page, (s) => s.office.snapshot.helpRequests.find((h: { id: string }) => h.id === 'hr_1')?.status)).toBe('on_agenda')

  await dropOnTrash(page, first)
  await expect(page.getByRole('status').getByText('"E2E 도움 요청 안건" 안건을 회의에서 뺐어요')).toBeVisible()
  await expect.poll(async () => (await runtime(page, `agenda:${first}`)).pos).toBeNull()
  // 안건은 지우지 않고 withdrawn으로 남는다
  const agenda = await readStore<{ id: string; status: string }[]>(page, (s) => s.office.snapshot.agendaItems)
  expect(agenda.find((a) => a.id === first)?.status).toBe('withdrawn')

  // 철회 직후 — 서버가 되돌린 값으로 다시 읽었다
  await expectRestored(page)

  // 새로고침한 뒤에도 같다
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await waitForScene(page)
  const detail = await expectRestored(page)

  // 「안건 후보 확정」으로 다시 올리면 회의실 탁자에 다시 놓이고 「회의 안건」 라벨이 붙는다
  await detail.getByRole('button', { name: '안건 후보 확정' }).click()
  await detail.getByRole('form', { name: '회의 안건으로 올리기' }).getByRole('button', { name: '회의실에 올리기' }).click()
  await expect(page.getByText('회의실 안건으로 올렸어요')).toBeVisible()
  await expect(detail.locator('.help-head')).toContainText('회의 안건')
  const again = await readStore(page, (s) =>
    s.office.snapshot.agendaItems.find((a: { status: string; source: { type: string; id: string } | null }) => a.status === 'confirmed' && a.source?.type === 'help_request' && a.source.id === 'hr_1')?.id as string | undefined,
  )
  expect(again).toBeTruthy()
  expect(again).not.toBe(first)
  await expect.poll(async () => (await runtime(page, `agenda:${again}`)).pos !== null, { message: 'raised again onto the table' }).toBe(true)
})

test('withdrawing with the meeting dialog button does the same; a help request already sent to the instructor keeps that request', async ({ page }) => {
  await openApp(page, 'mock')
  await raiseMine(page, 'E2E 강사 요청한 안건')
  // 안건인 동안 강사에게 요청했다 — 철회해도 끄지 않는다
  expect(await callStore(page, 'requestInstructorHelp', 'hr_1')).not.toBeNull()

  await page.getByRole('button', { name: /^회의/ }).click()
  const dialog = page.getByRole('dialog', { name: '회의 시작' })
  await dialog.getByRole('button', { name: 'E2E 강사 요청한 안건 안건 거두기' }).click()
  await expect.poll(() => readStore(page, (s) => s.office.snapshot.helpRequests.find((h: { id: string }) => h.id === 'hr_1')?.status)).toBe('discussing')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const detail = await openMine(page)
  const head = detail.locator('.help-head')
  await expect(head).toContainText('논의 중')
  await expect(head).toContainText('안건 후보')
  await expect(head).toContainText('강사 요청')
  await expect(head).not.toContainText('회의 안건')
  await expect(detail.getByText(/^강사에게 요청했어요/)).toBeVisible()
  await expect(detail.getByRole('button', { name: '강사에게 요청' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: '안건 후보 확정' })).toBeVisible()
  await expect(detail.getByRole('button', { name: '해결로 닫기' })).toBeVisible()
  await expect(detail.getByRole('list', { name: '코멘트' }).getByText(SEED_COMMENT)).toBeVisible()
})
