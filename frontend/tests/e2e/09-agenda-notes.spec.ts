// 9. Other agenda items (#31 · FR-LRN-11): written in the meeting dialog with no source, they join the agenda list and sit on
// the bridge table as the design's memo pad. Hovering names the kind and title; they open nothing (there is no original to
// open). Lessons are no longer written as agenda items or per decision — they go in the meeting notes (#318) — but learning
// items already saved still show as the octahedron.
import type { Page } from '@playwright/test'
import { callStore, expect, hoverBox, openApp, readStore, test } from './fixtures'

type Item = { id: string; kind: string; status: string; title: string; source: unknown; background: string | null; tried: string | null; unresolvedReason: string | null }

async function itemTitled(page: Page, title: string): Promise<Item | null> {
  const items = await readStore(page, (s) => s.office.snapshot.agendaItems as Item[])
  return items.find((a) => a.title === title) ?? null
}

/** Is the SceneModel key drawn in the 3D scene? */
function drawn(page: Page, key: string) {
  return page.evaluate(async (k) => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return rt.boxLive.has(k) as boolean
  }, key)
}

test('write an other item in the meeting dialog (no lesson inputs); it and an existing learning item sit on the bridge table', async ({ page, source }) => {
  await openApp(page, source)

  // A learning item saved before #318 (the API still takes the kind) — it keeps showing.
  await callStore(page, 'raiseAgendaItem', { kind: 'learning', sourceId: null, title: 'E2E 예전 배운 점', background: '리뷰에서 알게 됨', tried: null, unresolvedReason: null })
  await expect.poll(() => itemTitled(page, 'E2E 예전 배운 점')).toMatchObject({ kind: 'learning', status: 'confirmed' })

  await page.getByRole('button', { name: /^회의/ }).click()
  const start = page.getByRole('dialog', { name: '회의 시작' })
  // Only the other form — no "배운 점" entry and no kind choice.
  await expect(start.getByRole('button', { name: '배운 점 · 기타 안건 쓰기' })).toHaveCount(0)
  await start.getByRole('button', { name: '기타 안건 쓰기' }).click()
  const form = start.getByRole('form', { name: '기타 안건 쓰기' })
  await expect(form.getByRole('radiogroup', { name: '안건 종류' })).toHaveCount(0)

  // A title is required.
  await form.getByRole('button', { name: '안건 올리기' }).click()
  await expect(form.getByText('안건 제목은 1~100자로 적어 주세요')).toBeVisible()
  await form.getByRole('textbox', { name: '무엇을 이야기할까요' }).fill('E2E 기타 안건')
  await form.getByRole('textbox', { name: '해 본 것 (선택)' }).fill('규칙 문서 다시 읽기')
  await form.getByRole('button', { name: '안건 올리기' }).click()
  await expect(page.getByText('기타 안건을 올렸어요')).toBeVisible()
  const agenda = start.getByRole('list', { name: '안건' })
  await expect(agenda).toContainText('E2E 기타 안건')
  await expect(agenda).toContainText('E2E 예전 배운 점')

  await expect.poll(() => itemTitled(page, 'E2E 기타 안건')).toMatchObject({ kind: 'other', status: 'confirmed', source: null, tried: '규칙 문서 다시 읽기' })
  const learning = (await itemTitled(page, 'E2E 예전 배운 점'))!
  const other = (await itemTitled(page, 'E2E 기타 안건'))!

  await start.getByRole('button', { name: '취소' }).click()
  await expect(start).toBeHidden()

  // Both shapes are on the bridge table; hovering names the kind; a click opens nothing.
  for (const [item, label] of [
    [learning, '안건 · 배운 점'],
    [other, '안건 · 기타'],
  ] as const) {
    const key = `agenda:${item.id}`
    await expect.poll(() => drawn(page, key), { message: key }).toBe(true)
    const at = await hoverBox(page, key)
    await expect(page.getByText(label, { exact: true })).toBeVisible()
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => readStore(page, (s) => s.officeSelection)).toBeNull()
  }
})
