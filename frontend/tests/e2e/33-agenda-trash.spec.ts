// 33. 회의실 쓰레기통 (#291 — FR-LRN-14): 내가 올린 결정 전 안건을 회의실 탁자에서 끌어 쓰레기통에 놓으면 철회된다
// (withdrawAgendaItem — 원본 이슈는 그대로). 쓰레기통에 마우스를 올리면 툴팁이 뜨고, 벗어나면 닫힌다. 철회할 수 있는 안건을 끌면
// 쓰레기통이 은은하게 강조되고, 놓을 수 있는 범위에서는 "놓으면 회의에서 빠져요"가 보인다.
// 다른 사람이 올린 안건은 집어 들 수 없고, 끄는 사이 결정된 안건 · 서버가 거절한 철회는 탁자에 그대로 남으며 이유가 보인다.
// 끌기 어려운 사람을 위한 회의 시작 대화상자의 "안건 거두기" 버튼은 그대로 쓴다.
// 다른 사람의 안건은 mock 저장소(localStorage)에서 올린 사람을 바꾸고 다시 읽어 만든다(mock seed에는 안건이 없다).
import type { Page } from '@playwright/test'
import { callStore, expect, hoverBox, openApp, readStore, settled, test, waitForScene, type ScreenPoint } from './fixtures'

type Item = { id: string; status: string; title: string; raisedByMemberId: string }

/** Runtime drag state and whether a shape is drawn */
function runtime(page: Page, key: string) {
  return page.evaluate(async (k) => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const b = rt.boxLive.get(k)
    return {
      drag: rt.cargoDrag.key as string | null,
      agenda: rt.cargoDrag.agenda as boolean,
      overTrash: rt.cargoDrag.overTrash as boolean,
      pos: b ? { x: b.x as number, z: b.z as number } : null,
    }
  }, key)
}

/** The trash can's rim on screen (theme/station/geometry.ts BRIDGE_TRASH, drawn at WORLD_SCALE) */
async function trashPoint(page: Page): Promise<ScreenPoint> {
  const w = await page.evaluate(async () => {
    const geometryPath = '/src/theme/station/geometry.ts'
    const { BRIDGE_TRASH, bridgeTrashCenter, WORLD_SCALE } = await import(/* @vite-ignore */ geometryPath)
    const c = bridgeTrashCenter()
    return { x: c.x * WORLD_SCALE, y: (c.y + BRIDGE_TRASH.height * 0.6) * WORLD_SCALE, z: c.z * WORLD_SCALE }
  })
  return settled(page, { kind: 'point', ...w })
}

async function items(page: Page): Promise<Item[]> {
  return readStore(page, (s) => s.office.snapshot.agendaItems)
}

/** Open issues that have boxes in the scene */
async function openIssues(page: Page, n: number): Promise<{ id: string; title: string }[]> {
  const all = await readStore(page, (s) =>
    s.office.snapshot.tasks.filter((t: { state: string }) => t.state === 'open').map((t: { id: string; title: string }) => ({ id: t.id, title: t.title })),
  )
  return (all as { id: string; title: string }[]).slice(0, n)
}

async function raise(page: Page, taskId: string, title: string): Promise<string> {
  const item = await callStore<{ id: string } | null>(page, 'raiseAgendaItem', { kind: 'issue', sourceId: taskId, title, background: null, tried: null, unresolvedReason: null })
  expect(item).not.toBeNull()
  await expect.poll(async () => (await runtime(page, `agenda:${item!.id}`)).pos !== null, { message: 'agenda shape on the table' }).toBe(true)
  return item!.id
}

/** Press an agenda shape and move off it; returns whether it was picked up */
async function pickUp(page: Page, key: string): Promise<boolean> {
  const from = await hoverBox(page, key)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
  await page.waitForTimeout(150)
  return (await runtime(page, key)).drag === key
}

/** The persisted mock state (what the "server" holds) */
function storedItem(page: Page, id: string) {
  return page.evaluate((itemId) => {
    const raw = localStorage.getItem('gravit.mock.v1')
    if (!raw) return null
    const state = JSON.parse(raw) as { workspaces: { snapshot: { agendaItems: { id: string; status: string }[] } }[] }
    for (const ws of state.workspaces) {
      const a = ws.snapshot.agendaItems.find((x) => x.id === itemId)
      if (a) return a.status
    }
    return null
  }, id)
}

test('drag my agenda item onto the trash can to withdraw it; the original issue stays; the tooltip opens and closes', async ({ page }) => {
  await openApp(page, 'mock')
  const [issue] = await openIssues(page, 1)
  test.skip(!issue, 'mock seed에 열린 이슈가 없다')
  const id = await raise(page, issue.id, 'E2E 쓰레기통 안건')
  const key = `agenda:${id}`

  // Tooltip: hovering the bin opens it right beside the bin, leaving closes it.
  const trash = await trashPoint(page)
  const tooltip = page.getByRole('tooltip', { name: '안건을 여기에 놓으면 회의에서 뺄 수 있어요' })
  await page.mouse.move(trash.x, trash.y, { steps: 4 })
  await expect(tooltip).toBeVisible()
  const tip = (await tooltip.boundingBox())!
  expect(tip.x).toBeGreaterThan(trash.x) // to the right of the bin
  expect(Math.abs(tip.y + tip.height / 2 - trash.y)).toBeLessThan(60) // at about the bin's height
  await page.mouse.move(trash.x, Math.max(20, trash.y - 260), { steps: 4 })
  await expect(tooltip).toBeHidden()

  // Pick it up: the bin is armed (soft highlight) but not ready until the pointer reaches it.
  expect(await pickUp(page, key)).toBe(true)
  expect((await runtime(page, key)).agenda).toBe(true)
  await expect(page.getByTestId('agenda-trash-drop')).toHaveCount(0)
  await page.mouse.move(trash.x, trash.y, { steps: 14 })
  await expect.poll(async () => (await runtime(page, key)).overTrash).toBe(true)
  await expect(page.getByTestId('agenda-trash-drop')).toHaveText('놓으면 회의에서 빠져요')
  await expect(tooltip).toBeHidden() // no tooltip while dragging
  await page.mouse.up()

  // Withdrawn: off the table and the agenda; only the agenda item changed — the issue is still open and in its place.
  await expect.poll(async () => (await items(page)).find((a) => a.id === id)?.status).toBe('withdrawn')
  await expect.poll(async () => (await runtime(page, key)).pos).toBeNull()
  await expect(page.getByRole('status').getByText('"E2E 쓰레기통 안건" 안건을 회의에서 뺐어요')).toBeVisible()
  expect(await readStore(page, (s) => s.office.snapshot.tasks.find((t: { id: string }) => t.id === s.office.snapshot.agendaItems.at(-1).source.id)?.state)).toBe('open')
  expect((await runtime(page, `task:${issue.id}`)).pos).not.toBeNull()
  expect(await storedItem(page, id)).toBe('withdrawn')

  await page.getByRole('button', { name: /^회의/ }).click()
  await expect(page.getByRole('dialog', { name: '회의 시작' }).getByText('E2E 쓰레기통 안건')).toHaveCount(0)
})

test("someone else's item can't be picked up; a refused or failed drop leaves the item on the table and says why; the button still withdraws", async ({ page }) => {
  await openApp(page, 'mock')
  const issues = await openIssues(page, 2)
  test.skip(issues.length < 2, 'mock seed에 열린 이슈가 2개 없다')
  const theirs = await raise(page, issues[0].id, 'E2E 남의 안건')
  const mine = await raise(page, issues[1].id, 'E2E 내 안건')

  // Make the first item someone else's on the mock "server", then read the office again.
  const other = await readStore(page, (s) => s.office.snapshot.members.find((m: { id: string }) => m.id !== s.office.snapshot.viewer.memberId)?.id as string)
  await page.evaluate(
    ([itemId, memberId]) => {
      const state = JSON.parse(localStorage.getItem('gravit.mock.v1')!)
      for (const ws of state.workspaces) for (const a of ws.snapshot.agendaItems) if (a.id === itemId) a.raisedByMemberId = memberId
      localStorage.setItem('gravit.mock.v1', JSON.stringify(state))
    },
    [theirs, other] as const,
  )
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await waitForScene(page)
  expect((await items(page)).find((a) => a.id === theirs)?.raisedByMemberId).toBe(other)

  // Someone else's item: pressing it doesn't pick it up (the camera orbits instead) and the bin never lights up.
  expect(await pickUp(page, `agenda:${theirs}`)).toBe(false)
  const trash = await trashPoint(page)
  await page.mouse.move(trash.x, trash.y, { steps: 8 })
  await expect(page.getByTestId('agenda-trash-drop')).toHaveCount(0)
  await page.mouse.up()
  expect((await items(page)).find((a) => a.id === theirs)?.status).toBe('confirmed')

  // The server refuses (e.g. decided by someone else a moment ago): the item stays on the table and the reason is shown.
  await page.evaluate(async () => {
    const sessionPath = '/src/session.ts'
    const dsPath = '/src/data/DataSource.ts'
    const { currentSourceForTest } = await import(/* @vite-ignore */ sessionPath)
    const { DataError } = await import(/* @vite-ignore */ dsPath)
    currentSourceForTest().failNext('withdrawAgendaItem', new DataError('이미 결정했거나 거둔 안건이에요', 'conflict', 409))
  })
  const mineKey = `agenda:${mine}`
  const home = (await runtime(page, mineKey)).pos!
  expect(await pickUp(page, mineKey)).toBe(true)
  const trash2 = await trashPoint(page)
  await page.mouse.move(trash2.x, trash2.y, { steps: 14 })
  await expect.poll(async () => (await runtime(page, mineKey)).overTrash).toBe(true)
  await page.mouse.up()
  await expect(page.getByRole('status').getByText('이미 결정했거나 거둔 안건이에요')).toBeVisible()
  expect((await items(page)).find((a) => a.id === mine)?.status).toBe('confirmed')
  await expect
    .poll(async () => {
      const now = (await runtime(page, mineKey)).pos
      return now ? Math.hypot(now.x - home.x, now.z - home.z) : Infinity
    }, { message: 'back in its place on the table' })
    .toBeLessThan(0.05)

  // Decided while being dragged: the drop is refused on the spot and no withdraw request is sent.
  expect(await pickUp(page, mineKey)).toBe(true)
  await page.evaluate(async (itemId) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const st = useOffice.getState()
    const snap = st.office.snapshot
    useOffice.setState({ office: { ...st.office, snapshot: { ...snap, agendaItems: snap.agendaItems.map((a: { id: string }) => (a.id === itemId ? { ...a, status: 'discussed' } : a)) } } })
  }, mine)
  const trash3 = await trashPoint(page)
  await page.mouse.move(trash3.x, trash3.y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('status').getByText('이미 결정했거나 거둔 안건이에요').last()).toBeVisible()
  expect(await storedItem(page, mine)).toBe('confirmed')

  // The button for those who can't drag still withdraws it.
  await page.reload()
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await page.getByRole('button', { name: /^회의/ }).click()
  const dialog = page.getByRole('dialog', { name: '회의 시작' })
  await expect(dialog.getByRole('button', { name: 'E2E 남의 안건 안건 거두기' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'E2E 내 안건 안건 거두기' }).click()
  await expect.poll(async () => (await items(page)).find((a) => a.id === mine)?.status).toBe('withdrawn')
})
