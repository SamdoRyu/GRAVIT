// 2. Task CRUD through the UI: create (with validation), edit in the detail drawer, delete with confirm.
// 데모 작업 대화상자 · 상세 서랍 검사. v1 사무실이 열리면 관리 패널 칸반은 v1 이슈 · PR(읽기 전용)이라
// 데모 작업 카드가 없다(#102 T5-c-2) — 상세는 store.select로 열고 결과는 store로 확인한다.
import { callStore, expect, openApp, serverWorkspace, taskByTitle, test } from './fixtures'

test('create, edit and delete a task through the UI', async ({ page, source, api }) => {
  await openApp(page, source, { scene: false })

  // --- create: empty title is rejected ---
  await page.getByRole('button', { name: '작업', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '새 작업' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '만들기' }).click()
  await expect(dialog.getByText('제목을 입력해 주세요')).toBeVisible()
  await expect(dialog).toBeVisible()

  // --- create: valid ---
  await dialog.getByPlaceholder('무엇을 해야 하나요?').fill('E2E 새 작업')
  await dialog.getByRole('button', { name: '만들기' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('작업을 만들었어요')).toBeVisible()
  const created = await taskByTitle(page, 'E2E 새 작업')
  expect(created.status).toBe('todo')
  expect(created.assigneeId).toBeNull()
  if (source === 'api') expect((await serverWorkspace(api)).tasks.some((t) => t.id === created.id)).toBe(true)

  // --- edit the title in the detail drawer ---
  await callStore(page, 'select', { kind: 'task', id: created.id })
  const detail = page.getByRole('complementary', { name: '작업 상세' })
  await expect(detail).toBeVisible()
  const title = detail.getByRole('textbox', { name: '제목' })
  await expect(title).toHaveValue('E2E 새 작업')
  await title.fill('E2E 수정된 작업')
  await title.press('Enter')
  await expect.poll(async () => (await taskByTitle(page, 'E2E 수정된 작업').catch(() => null))?.id).toBe(created.id)
  if (source === 'api') {
    await expect.poll(async () => (await serverWorkspace(api)).tasks.find((t) => t.id === created.id)?.title).toBe('E2E 수정된 작업')
  }

  // --- delete: cancel keeps it, confirm removes it ---
  await detail.getByRole('button', { name: '삭제' }).click()
  const confirm = page.getByRole('dialog', { name: '작업을 삭제할까요?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '취소' }).click()
  await expect(confirm).toBeHidden()
  await expect(detail).toBeVisible()

  await detail.getByRole('button', { name: '삭제' }).click()
  await page.getByRole('dialog', { name: '작업을 삭제할까요?' }).getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('작업을 삭제했어요')).toBeVisible()
  await expect(detail).toBeHidden()
  await expect.poll(() => taskByTitle(page, 'E2E 수정된 작업').then(() => true, () => false)).toBe(false)
  if (source === 'api') {
    await expect.poll(async () => (await serverWorkspace(api)).tasks.some((t) => t.id === created.id)).toBe(false)
  }
})
