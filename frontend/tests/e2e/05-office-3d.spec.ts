// 5. The 3D station shows the v1 office (#102 T5-c-2 · #10 · #11): one avatar per seated member, one box per placed
// issue / PR. It is read-only: a click opens the v1 detail drawer, pressing and moving a box does not drag it.
// Expected values come from the Snapshot in the page (no seed numbers baked in).
import type { Page } from '@playwright/test'
import { expect, hoverBox, openApp, readStore, settled, test } from './fixtures'

/** Seated member ids and a box key per kind, read from the page's Snapshot through the same scene functions. */
async function sceneFacts(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const scenePath = '/src/scene/stationScene.ts'
    const slotsPath = '/src/scene/slots.ts'
    const rtPath = '/src/scene/runtime.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const { stationSceneFor } = await import(/* @vite-ignore */ scenePath)
    const { computeSlots } = await import(/* @vite-ignore */ slotsPath)
    const rt = await import(/* @vite-ignore */ rtPath)
    const snap = useOffice.getState().office.snapshot
    const scene = stationSceneFor(snap)
    const slots = computeSlots(scene.entities, snap, scene.layout, new Map(), new Map()) as Map<string, { home: string }>
    const issueKey = [...slots].find(([k, s]) => k.startsWith('task:') && s.home === 'desk')?.[0] ?? null
    const issue = issueKey ? snap.tasks.find((t: { id: string }) => `task:${t.id}` === issueKey) : null
    return {
      crew: (scene.crew as { id: string; displayName: string }[]).map((m) => ({ id: m.id, name: m.displayName })),
      avatars: [...rt.avatarLive.keys()].sort(),
      issue: issue ? { key: issueKey as string, id: issue.id as string, title: issue.title as string } : null,
    }
  })
}

/** Move the real mouse onto a crew member until store.hover reports them (hover id = 'member:<id>'). */
async function hoverMember(page: Page, id: string): Promise<void> {
  const base = await settled(page, { kind: 'member', id })
  for (const dy of [0, 6, 12, -6, 18, -12, 24]) {
    await page.mouse.move(base.x, base.y + dy)
    const hover = await readStore(page, (s) => s.hover)
    if (hover?.kind === 'member' && hover.id === `member:${id}`) return
  }
  throw new Error(`could not hover member ${id}`)
}

test('the 3D station shows the v1 crew and boxes, opens the detail on click and does not drag', async ({ page, source }) => {
  await openApp(page, source)
  const facts = await sceneFacts(page)
  expect(facts.crew.length).toBeGreaterThan(0)
  await expect.poll(async () => (await sceneFacts(page)).avatars).toEqual(facts.crew.map((m) => m.id).sort())
  test.skip(facts.issue === null, 'mock seed에 포드 위 이슈가 없다')
  const issue = facts.issue!

  // Pressing a box and moving does not pick it up (no 3D drag in the v1 office).
  const at = await hoverBox(page, issue.key)
  await page.mouse.down()
  await page.mouse.move(at.x + 40, at.y + 30, { steps: 6 })
  expect(await readStore(page, (s) => s.drag)).toBeNull()
  await page.mouse.up()

  // A click on the box opens the issue detail.
  const at2 = await hoverBox(page, issue.key)
  await page.mouse.click(at2.x, at2.y)
  await expect.poll(() => readStore(page, (s) => s.officeSelection)).toEqual({ kind: 'task', id: issue.id })
  const issueDetail = page.getByRole('complementary', { name: '이슈 상세' })
  await expect(issueDetail.getByRole('heading', { name: issue.title })).toBeVisible()

  // A click on a crew member opens the member detail.
  await page.keyboard.press('Escape')
  const member = facts.crew[0]
  await hoverMember(page, member.id)
  const pos = await settled(page, { kind: 'member', id: member.id })
  const hovered = await readStore(page, (s) => s.hover)
  expect(hovered).toEqual({ kind: 'member', id: `member:${member.id}` })
  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => readStore(page, (s) => s.officeSelection)).toEqual({ kind: 'member', id: member.id })
  await expect(page.getByRole('complementary', { name: '팀원 상세' }).getByText(member.name, { exact: true })).toBeVisible()
  expect(pos.free).toBe(true)
})
