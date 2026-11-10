// 회의실 쓰레기통으로 안건을 끌어 놓는 E2E 도우미 (#291 · #314) — 33 · 35가 같이 쓴다.
import type { Page } from '@playwright/test'
import { expect, hoverBox, settled, type ScreenPoint } from './fixtures'

/** Runtime drag state and whether a shape is drawn */
export function runtime(page: Page, key: string) {
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
export async function trashPoint(page: Page): Promise<ScreenPoint> {
  const w = await page.evaluate(async () => {
    const geometryPath = '/src/theme/station/geometry.ts'
    const { BRIDGE_TRASH, bridgeTrashCenter, WORLD_SCALE } = await import(/* @vite-ignore */ geometryPath)
    const c = bridgeTrashCenter()
    return { x: c.x * WORLD_SCALE, y: (c.y + BRIDGE_TRASH.height * 0.6) * WORLD_SCALE, z: c.z * WORLD_SCALE }
  })
  return settled(page, { kind: 'point', ...w })
}

/** Press an agenda shape and move off it; returns whether it was picked up */
export async function pickUp(page: Page, key: string): Promise<boolean> {
  const from = await hoverBox(page, key)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
  await page.waitForTimeout(150)
  return (await runtime(page, key)).drag === key
}

/** Wait until the agenda shape is on the bridge table, pick it up and let go over the trash can */
export async function dropOnTrash(page: Page, agendaItemId: string): Promise<void> {
  const key = `agenda:${agendaItemId}`
  await expect.poll(async () => (await runtime(page, key)).pos !== null, { message: 'agenda shape on the table' }).toBe(true)
  const trash = await trashPoint(page)
  expect(await pickUp(page, key)).toBe(true)
  await page.mouse.move(trash.x, trash.y, { steps: 14 })
  await expect.poll(async () => (await runtime(page, key)).overTrash).toBe(true)
  await page.mouse.up()
}
