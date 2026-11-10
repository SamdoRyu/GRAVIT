// 36. 도움 요청 삭제 두 방식 (#316 — CONTRACTS_API.md 「11」 도움 요청 삭제, 서버 #315): 상세의 「삭제」를 누르면 범위를 고른다.
// 요청자는 「나에게서만 삭제」 · 「모두에게서 영구 삭제」, 그 밖의 사람은 「나에게서만 삭제」만. 영구 삭제는 경고(다른 사람 코멘트 개수 ·
// 복원 불가 · 연결 안건)를 본 뒤 한 번 더 눌러야 지운다. 숨긴 요청은 「숨긴 도움 요청」에서 다시 보이게 할 수 있다.
// mock seed: 내 글 hr_1(이삼도 코멘트 1개) · 박데브의 글 hr_2. 테스트마다 새 브라우저 저장소라 seed에서 시작한다.
import type { Page } from '@playwright/test'
import { runtime } from './agendaTrash'
import { callStore, expect, openApp, readStore, test, waitForScene } from './fixtures'

const MINE = /세션이 자꾸 끊겨요/
const OTHERS = /3D 상자를 끌면/

const panel = (page: Page) => page.getByRole('region', { name: '관리 패널' })
const list = (page: Page) => panel(page).getByRole('list', { name: '도움 요청 목록' })

async function openHelpTab(page: Page) {
  await panel(page).getByRole('tab', { name: /도움 요청/ }).click()
}

async function openDelete(page: Page, which: RegExp) {
  await list(page).getByRole('button', { name: which }).click()
  const detail = panel(page).getByRole('region', { name: '도움 요청 상세' })
  await detail.getByRole('button', { name: '삭제' }).click()
  const dialog = page.getByRole('dialog', { name: '도움 요청 삭제' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** mock 저장값(서버가 가진 것)에 그 내용이 남아 있는지 */
const storedHas = (page: Page, text: string) => page.evaluate((t) => (localStorage.getItem('gravit.mock.v1') ?? '').includes(t), text)

test('the requester deletes for everyone only after the warning and a second confirmation; it stays gone after a reload', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await openHelpTab(page)
  const dialog = await openDelete(page, MINE)

  // 두 범위가 보이고, 처음은 「나에게서만 삭제」
  await expect(dialog.getByRole('radio', { name: /나에게서만 삭제/ })).toBeChecked()
  await dialog.getByRole('radio', { name: /모두에게서 영구 삭제/ }).check()
  await dialog.getByRole('button', { name: '다음' }).click()

  // 경고 — 다른 사람 코멘트 개수 · 복원 불가 · 결정 기록 처리
  const warning = dialog.getByRole('alert')
  await expect(warning).toContainText('되돌릴 수 없어요')
  await expect(warning).toContainText('다른 사람이 쓴 코멘트 1개도 함께 지워져요')
  await expect(warning).toContainText('삭제된 도움 요청')
  // 뒤로 가면 아무것도 지우지 않는다
  await dialog.getByRole('button', { name: '뒤로' }).click()
  await expect(dialog.getByRole('radio', { name: /모두에게서 영구 삭제/ })).toBeChecked()
  expect(await storedHas(page, '세션이 자꾸 끊겨요')).toBe(true)

  await dialog.getByRole('button', { name: '다음' }).click()
  await dialog.getByRole('button', { name: '영구 삭제' }).click()
  await expect(page.getByText('도움 요청을 모두에게서 지웠어요')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(list(page).getByRole('button', { name: MINE })).toHaveCount(0)
  expect(await storedHas(page, '세션이 자꾸 끊겨요')).toBe(false) // 원문이 저장값에 남지 않는다
  expect(await storedHas(page, 'same-site를 확인해 보세요')).toBe(false) // 남의 코멘트도

  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await openHelpTab(page)
  await expect(list(page).getByRole('button', { name: OTHERS })).toBeVisible()
  await expect(list(page).getByRole('button', { name: MINE })).toHaveCount(0)
})

test("someone else's request can only be hidden for me; it stays hidden after a reload and comes back from the hidden list", async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await openHelpTab(page)
  const dialog = await openDelete(page, OTHERS)
  await expect(dialog.getByRole('radio', { name: /모두에게서 영구 삭제/ })).toHaveCount(0)
  await dialog.getByRole('button', { name: '나에게서만 삭제' }).click()
  await expect(page.getByText('내 화면에서 숨겼어요', { exact: false })).toBeVisible()
  await expect(list(page).getByRole('button', { name: OTHERS })).toHaveCount(0)
  expect(await storedHas(page, '3D 상자를 끌면')).toBe(true) // 원본은 그대로

  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await openHelpTab(page)
  await expect(list(page).getByRole('button', { name: OTHERS })).toHaveCount(0)

  await panel(page).getByRole('button', { name: '숨긴 도움 요청' }).click()
  const hidden = panel(page).getByRole('list', { name: '숨긴 도움 요청 목록' })
  await expect(hidden.getByText(OTHERS)).toBeVisible()
  await hidden.getByRole('button', { name: /숨김 해제/ }).click()
  await expect(page.getByText('숨김을 풀었어요', { exact: false })).toBeVisible()
  await expect(list(page).getByRole('button', { name: OTHERS })).toBeVisible()
  await expect(panel(page).getByText('숨긴 도움 요청이 없어요.')).toBeVisible()
})

test('deleting a request that is on the agenda withdraws its agenda item and leaves "삭제된 도움 요청" instead of the copied text', async ({ page }) => {
  await openApp(page, 'mock')
  const item = await callStore<{ id: string } | null>(page, 'convertHelpRequestToAgenda', 'hr_1', '로컬에서 GitHub 로그인 뒤 세션이 자꾸 끊겨요')
  expect(item).not.toBeNull()
  await expect.poll(async () => (await runtime(page, `agenda:${item!.id}`)).pos !== null, { message: 'agenda shape on the table' }).toBe(true)

  await openHelpTab(page)
  const dialog = await openDelete(page, MINE)
  await dialog.getByRole('radio', { name: /모두에게서 영구 삭제/ }).check()
  await dialog.getByRole('button', { name: '다음' }).click()
  await expect(dialog.getByRole('alert')).toContainText('회의 안건으로 올라가 있는 안건은 거둬져서')
  await dialog.getByRole('button', { name: '영구 삭제' }).click()
  await expect(page.getByText('도움 요청을 모두에게서 지웠어요')).toBeVisible()

  const agenda = await readStore<{ id: string; status: string; kind: string; source: unknown; title: string }[]>(page, (s) => s.office.snapshot.agendaItems)
  const left = agenda.find((a) => a.id === item!.id)!
  expect([left.status, left.kind, left.source, left.title]).toEqual(['withdrawn', 'help_request', null, '삭제된 도움 요청'])
  await waitForScene(page)
  await expect.poll(async () => (await runtime(page, `agenda:${item!.id}`)).pos).toBeNull()
  expect(await storedHas(page, '세션이 자꾸 끊겨요')).toBe(false)
})
