// 8. Raise an agenda item from the 3D station (#30 · #26 — CONTRACTS.md 「8」 드롭 결과): drag an issue box / a PR prism onto
// the bridge → the agenda dialog → an agenda shape appears on the bridge table, the original flies back to its own place, and
// a PR item remembers the round at the time it was raised. Dropping anywhere else does nothing.
import type { Page } from '@playwright/test'
import { expect, hoverBox, openApp, readStore, settled, test } from './fixtures'

/** Runtime drag state and a box's live position */
function runtime(page: Page, key: string) {
  return page.evaluate(async (k) => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const b = rt.boxLive.get(k)
    return { drag: rt.cargoDrag.key as string | null, over: rt.cargoDrag.overMeeting as boolean, pos: b ? { x: b.x as number, z: b.z as number } : null }
  }, key)
}

/** An open issue and an open PR that have boxes in the scene */
async function pick(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const rtPath = '/src/scene/runtime.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const rt = await import(/* @vite-ignore */ rtPath)
    const snap = useOffice.getState().office.snapshot
    const t = snap.tasks.find((x: { id: string; state: string }) => x.state === 'open' && rt.boxLive.has(`task:${x.id}`))
    const p = snap.submissions.find((x: { id: string; state: string; currentRound: unknown }) => x.state === 'open' && x.currentRound && rt.boxLive.has(`submission:${x.id}`))
    return t && p ? { task: { id: t.id as string, title: t.title as string }, pr: { id: p.id as string, title: p.title as string, roundId: p.currentRound.id as string } } : null
  })
}

/** Press a box, carry it over `to` (client px), check the bridge highlight, let go. */
async function dragBoxTo(page: Page, key: string, to: { x: number; y: number }, expectOverBridge: boolean) {
  const from = await hoverBox(page, key)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 10)
  await expect.poll(async () => (await runtime(page, key)).drag, { message: 'drag started' }).toBe(key)
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await expect.poll(async () => (await runtime(page, key)).over).toBe(expectOverBridge)
  await page.mouse.up()
  await expect.poll(async () => (await runtime(page, key)).drag, { message: 'drag ended' }).toBeNull()
}

async function agendaItems(page: Page) {
  return readStore(page, (s) => s.office.snapshot.agendaItems as { id: string; status: string; kind: string; source: { type: string; id: string } | null; evaluationRoundId: string | null }[])
}

test('drag an issue box and a PR prism onto the bridge to raise them; elsewhere nothing happens', async ({ page, source }) => {
  await openApp(page, source)
  const facts = await pick(page)
  test.skip(facts === null, 'mock seed에 장면에 놓인 열린 이슈 · 회차 있는 열린 PR이 없다')
  const { task, pr } = facts!
  const issueKey = `task:${task.id}`
  const bridge = await settled(page, { kind: 'agenda' })
  const home = (await runtime(page, issueKey)).pos!

  // Dropping on empty space (not the bridge) does nothing.
  await dragBoxTo(page, issueKey, { x: bridge.x, y: Math.max(20, bridge.y - 220) }, false)
  await expect(page.getByRole('dialog', { name: '안건 올리기' })).toHaveCount(0)

  // Issue box → bridge → dialog (title prefilled from the issue) → raise.
  await dragBoxTo(page, issueKey, bridge, true)
  const dialog = page.getByRole('dialog', { name: '안건 올리기' })
  await expect(dialog.getByRole('textbox', { name: '무엇을 이야기할까요' })).toHaveValue(task.title.slice(0, 100))
  await dialog.getByRole('textbox', { name: '해 본 것 (선택)' }).fill('E2E 해 본 것')
  await dialog.getByRole('button', { name: '안건 올리기' }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await agendaItems(page)).some((a) => a.status === 'confirmed' && a.kind === 'issue' && a.source?.id === task.id)).toBe(true)
  const issueItem = (await agendaItems(page)).find((a) => a.kind === 'issue' && a.source?.id === task.id)!

  // An agenda shape is on the bridge table; the original box is back in its own place.
  await expect.poll(async () => (await runtime(page, `agenda:${issueItem.id}`)).pos !== null).toBe(true)
  await expect
    .poll(async () => {
      const now = (await runtime(page, issueKey)).pos!
      return Math.hypot(now.x - home.x, now.z - home.z)
    })
    .toBeLessThan(0.05)

  // PR prism → bridge: the item remembers the current evaluation round.
  await dragBoxTo(page, `submission:${pr.id}`, bridge, true)
  await page.getByRole('dialog', { name: '안건 올리기' }).getByRole('button', { name: '안건 올리기' }).click()
  await expect.poll(async () => (await agendaItems(page)).find((a) => a.kind === 'pr' && a.source?.id === pr.id)?.evaluationRoundId).toBe(pr.roundId)
})
