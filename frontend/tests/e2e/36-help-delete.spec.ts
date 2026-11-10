// 36. 도움 요청 삭제 두 방식 (#316 — CONTRACTS_API.md 「11」 도움 요청 삭제, 서버 #315): 상세의 「삭제」를 누르면 범위를 고른다.
// 요청자는 「나에게서만 삭제」 · 「모두에게서 영구 삭제」, 그 밖의 사람은 「나에게서만 삭제」만. 영구 삭제는 경고(다른 사람 코멘트 개수 ·
// 복원 불가 · 연결 안건)를 본 뒤 한 번 더 눌러야 지운다. 나에게서만 삭제는 실행 버튼이 「확인」이고, 내 목록에서만 빠지며 되돌리는
// 화면(숨긴 목록 · 숨김 해제)은 없다(#333). 최종 「영구 삭제」 버튼은 흰 글자이고 마우스를 올려도 색이 바뀌지 않는다.
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
  // 최종 버튼 — 흰 글자, hover에도 글자 · 배경이 그대로(#333)
  const finalButton = dialog.getByRole('button', { name: '영구 삭제' })
  const look = () => finalButton.evaluate((el) => { const s = getComputedStyle(el); return `${s.color} / ${s.backgroundColor}` })
  // 색 전환(0.12s)이 끝나 두 번 연속 같은 값일 때 읽는다 — 「다음」에서 보라 → 빨강으로 바뀌는 중에 읽지 않게
  const settledLook = async () => {
    let last = ''
    await expect.poll(async () => { const now = await look(); const same = now === last; last = now; return same }, { intervals: [150] }).toBe(true)
    return last
  }
  const before = await settledLook()
  expect(before.startsWith('rgb(255, 255, 255) / ')).toBe(true)
  await finalButton.hover()
  expect(await settledLook()).toBe(before)
  await finalButton.click()
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

test("someone else's request can only be deleted for me — 「확인」 removes it from my list for good, the original stays, and there is no hidden list", async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await openHelpTab(page)
  const dialog = await openDelete(page, OTHERS)
  await expect(dialog.getByRole('radio', { name: /모두에게서 영구 삭제/ })).toHaveCount(0)
  await expect(dialog.getByRole('radio', { name: /나에게서만 삭제/ })).toBeChecked()
  await expect(dialog).not.toContainText('숨긴 도움 요청')
  await expect(dialog.getByRole('button', { name: '나에게서만 삭제' })).toHaveCount(0)
  await dialog.getByRole('button', { name: '확인' }).click()
  await expect(page.getByText('나에게서만 삭제했어요', { exact: false })).toBeVisible()
  await expect(page.getByText('숨긴 도움 요청', { exact: false })).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: OTHERS })).toHaveCount(0)
  expect(await storedHas(page, '3D 상자를 끌면')).toBe(true) // 원본은 그대로

  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await openHelpTab(page)
  await expect(list(page).getByRole('button', { name: OTHERS })).toHaveCount(0)
  await expect(panel(page).getByText('숨긴 도움 요청', { exact: false })).toHaveCount(0)
  await expect(panel(page).getByRole('button', { name: /숨김 해제/ })).toHaveCount(0)
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
