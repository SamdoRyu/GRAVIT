// 10. The requirement deck (#16 · #17 · #15 — CONTRACTS.md 「8」 요구사항 판 배치 · 드롭 결과), on the mock seed (#199):
// - team office (ws_1, 5 active): one plate per active requirement in document order, progress / "연결 없음" on the tags,
//   missing · needs_review not on the deck. The viewer is not R2 there: linking is refused (403) and nothing changes.
// - demo office (ws_2, 12 active, the viewer is R2): 9 plates + the waiting plate. Dragging an issue box onto a plate lights it
//   and links the issue to that requirement (progress updates, the box flies back); doing it again only says it is linked.
//   The waiting plate (#197): a click opens the waiting list, an issue dropped on it opens the list to pick the requirement,
//   and a swap (store requirementDeckOrder) moves the plates.
import type { Page } from '@playwright/test'
import { callStore, expect, hoverBox, readStore, settled, test, waitForScene } from './fixtures'

async function openOffice(page: Page, workspaceId: string) {
  await page.goto(`/?workspace=${workspaceId}`)
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null), { message: 'office ready' }).toBe('ready')
  await expect.poll(() => readStore(page, (s) => s.office?.snapshot?.workspace.id ?? null)).toBe(workspaceId)
  // The deck is at the station's east end, under the right panel: close the panel so it is on the canvas.
  await page.evaluate(async () => {
    const uiPath = '/src/ui/uiState.ts'
    const { useUi } = await import(/* @vite-ignore */ uiPath)
    useUi.getState().setPanelOpen(false)
  })
  await waitForScene(page)
}

const tags = (page: Page) => page.locator('[data-plate-tag]')

/** Names of the requirement plates in the 3D scene (not the waiting plate) */
function plates(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const names: string[] = []
    rt.sceneApi.get().scene.traverse((o: { name: string }) => {
      if (o.name.startsWith('requirement:') && o.name !== 'requirement:waiting') names.push(o.name)
    })
    return names
  })
}

/** The world point of a requirement plate (its ThemeLayout anchor) */
function plateWorld(page: Page, requirementId: string) {
  return page.evaluate(async (id) => {
    const storePath = '/src/store.ts'
    const scenePath = '/src/scene/stationScene.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const { stationSceneFor } = await import(/* @vite-ignore */ scenePath)
    const [x, y, z] = stationSceneFor(useOffice.getState().office.snapshot).layout.anchor(`requirement:${id}`, 0)
    return { x: x as number, y: y as number, z: z as number }
  }, requirementId)
}

/** An open issue of the open office that has a box in the scene */
function openIssueWithBox(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const rtPath = '/src/scene/runtime.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const rt = await import(/* @vite-ignore */ rtPath)
    const t = useOffice.getState().office.snapshot.tasks.find((x: { id: string; state: string }) => x.state === 'open' && rt.boxLive.has(`task:${x.id}`))
    return t ? (t.id as string) : null
  })
}

function drag(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return { key: rt.cargoDrag.key as string | null, target: rt.cargoDrag.target as string | null }
  })
}

/** Press an issue box, carry it over a requirement plate (its target must light up), let go. */
async function dropOnPlate(page: Page, taskId: string, requirementId: string) {
  const key = `task:${taskId}`
  const to = await settled(page, { kind: 'point', ...(await plateWorld(page, requirementId)) })
  const from = await hoverBox(page, key)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 10)
  await expect.poll(async () => (await drag(page)).key, { message: 'drag started' }).toBe(key)
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await expect.poll(async () => (await drag(page)).target, { message: 'plate is the drop target' }).toBe(`requirement:${requirementId}`)
  await page.mouse.up()
  await expect.poll(async () => (await drag(page)).key, { message: 'drag ended' }).toBeNull()
}

/** "requirementId:taskId" of the requirement's links in the open office */
async function linksOf(page: Page, requirementId: string): Promise<string[]> {
  const all: string[] = await readStore(page, (s) => s.office.snapshot.requirementLinks.map((l: { requirementId: string; taskId: string }) => `${l.requirementId}:${l.taskId}`))
  return all.filter((l) => l.startsWith(`${requirementId}:`))
}

test('team office: plates in document order with progress and empty zones; linking as a participant is refused', async ({ page }) => {
  await openOffice(page, 'ws_1')
  await expect.poll(() => plates(page)).toEqual(['requirement:rq_1', 'requirement:rq_2', 'requirement:rq_3', 'requirement:rq_4', 'requirement:rq_5'])
  await expect(tags(page)).toHaveCount(5)
  await expect(tags(page).nth(2)).toContainText('FR-REQ-05 · 연결 없음')
  await expect(tags(page).nth(3)).toContainText('동기화 상태 표시')
  await expect(tags(page).filter({ hasText: '이메일 알림' })).toHaveCount(0)
  await expect(tags(page).filter({ hasText: '회고 리포트' })).toHaveCount(0)

  const taskId = await openIssueWithBox(page)
  test.skip(taskId === null, 'mock seed에 장면에 놓인 열린 이슈가 없다')
  await dropOnPlate(page, taskId!, 'rq_3')
  await expect(page.getByText('요구사항 연결은 레포 관리자만 바꿀 수 있어요')).toBeVisible()
  expect(await linksOf(page, 'rq_3')).toEqual([])
})

test('demo office: 9 plates + the waiting plate; drop an issue on a plate to link it, again only says so', async ({ page }) => {
  await openOffice(page, 'ws_2')
  await expect.poll(async () => (await plates(page)).length).toBe(9)
  const waiting = tags(page).filter({ hasText: '대기 ×3' })
  await expect(waiting).toHaveCount(1)
  await expect(waiting).toContainText('빈 구역 2')

  const taskId = await openIssueWithBox(page)
  test.skip(taskId === null, 'mock seed에 장면에 놓인 열린 이슈가 없다')
  const plate = tags(page).filter({ hasText: 'FR-DEMO-03' })
  await expect(plate).toContainText('연결 없음')

  await dropOnPlate(page, taskId!, 'rq_23')
  await expect(page.getByText('FR-DEMO-03에 연결했어요')).toBeVisible()
  await expect.poll(() => linksOf(page, 'rq_23')).toEqual([`rq_23:${taskId}`])
  await expect(plate).toContainText('FR-DEMO-03 · 0/1')

  await dropOnPlate(page, taskId!, 'rq_23')
  await expect(page.getByText('이미 FR-DEMO-03에 연결된 이슈예요')).toBeVisible()
  expect(await linksOf(page, 'rq_23')).toHaveLength(1)
})

/** World position of a plate object in the scene */
function plateAt(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const o = rt.sceneApi.get().scene.getObjectByName(n)
    if (!o) return null
    const p = o.getWorldPosition(o.position.clone())
    return { x: p.x as number, z: p.z as number }
  }, name)
}

test('demo office: the waiting plate opens the waiting list, takes an issue to pick its requirement, and a swap moves the plates', async ({ page }) => {
  await openOffice(page, 'ws_2')
  await expect.poll(async () => (await plates(page)).length).toBe(9)

  // A click on the waiting plate opens the waiting list.
  const waitingPoint = await settled(page, { kind: 'point', ...(await plateWorld(page, 'waiting')) })
  await page.mouse.click(waitingPoint.x, waitingPoint.y)
  const list = page.getByRole('dialog', { name: '대기 중인 요구사항' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('list', { name: '대기 중인 요구사항' }).getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()

  // An issue box dropped on the waiting plate opens the list to pick the requirement to link.
  const taskId = await openIssueWithBox(page)
  test.skip(taskId === null, 'mock seed에 장면에 놓인 열린 이슈가 없다')
  await dropOnPlate(page, taskId!, 'waiting')
  const pick = page.getByRole('dialog', { name: '연결할 요구사항 고르기' })
  await expect(pick).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pick).toBeHidden()

  // Swap the first plate with a waiting one: it leaves the deck, the waiting one glides into the first place.
  const first = await plateWorld(page, 'rq_21')
  await callStore(page, 'setRequirementDeckOrder', ['rq_30', 'rq_22', 'rq_23', 'rq_24', 'rq_25', 'rq_26', 'rq_27', 'rq_28', 'rq_29'])
  await expect.poll(async () => (await plates(page))[0]).toBe('requirement:rq_30')
  await expect.poll(async () => (await plates(page)).includes('requirement:rq_21')).toBe(false)
  await expect
    .poll(async () => {
      const p = await plateAt(page, 'requirement:rq_30')
      return p ? Math.hypot(p.x - first.x, p.z - first.z) : 99
    })
    .toBeLessThan(0.01)
})

test('a click on a requirement plate opens the panel on the 요구사항 tab', async ({ page }) => {
  await openOffice(page, 'ws_1')
  await expect.poll(async () => (await plates(page)).length).toBe(5)
  const panel = page.getByRole('region', { name: '관리 패널' })
  await expect(panel).toBeHidden()
  const at = await settled(page, { kind: 'point', ...(await plateWorld(page, 'rq_1')) })
  await page.mouse.click(at.x, at.y)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^요구사항/ })).toHaveAttribute('aria-selected', 'true')
  expect(await readStore(page, (s) => s.officeSelection)).toBeNull()
})
