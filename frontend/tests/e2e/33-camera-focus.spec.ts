// 33. 선택한 대상으로 카메라 이동 (#286): 팀원 · 이슈를 고르면(3D 클릭 · 패널 모두 같은 선택 상태) 보는 각도는 그대로 두고 다가가고,
// 선택을 풀면 원래 시점으로 돌아온다. 다가간 동안 사용자가 카메라를 움직였으면 풀어도 돌아가지 않는다.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, test } from './fixtures'

/** 지금 카메라 위치 · 바라보는 점, 그리고 첫 팀원의 아바타 자리 */
function cameraState(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const c = rt.cameraLock.controls
    const cam = rt.sceneApi.get?.().camera
    const [id, a] = [...rt.avatarLive.entries()][0] ?? []
    return {
      target: c ? [c.target.x, c.target.y, c.target.z] : null,
      dist: c && cam ? cam.position.distanceTo(c.target) : null,
      member: id ? { id: id as string, at: [a.x, a.y + 0.5, a.z] } : null,
    }
  })
}

const gap = (a: number[] | null, b: number[]) => (a ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity)

test('selecting a crew member eases the camera to them, and clearing it eases back', async ({ page, source }) => {
  await openApp(page, source)
  await page.waitForTimeout(1500) // 첫 화면 맞춤이 끝나게
  const home = await cameraState(page)
  expect(home.member).not.toBeNull()
  const member = home.member!

  await callStore(page, 'selectInOffice', { kind: 'member', id: member.id })
  await expect.poll(async () => gap((await cameraState(page)).target, member.at), { timeout: 4000 }).toBeLessThan(0.6)
  const near = await cameraState(page)
  expect(near.dist!).toBeLessThan(home.dist! * 0.8)

  await callStore(page, 'selectInOffice', null)
  await expect.poll(async () => gap((await cameraState(page)).target, home.target!), { timeout: 4000 }).toBeLessThan(0.05)
  expect(Math.abs((await cameraState(page)).dist! - home.dist!)).toBeLessThan(0.3)
})

test('if the user moves the camera while focused, clearing the selection keeps their view', async ({ page, source }) => {
  await openApp(page, source)
  await page.waitForTimeout(1500)
  const home = await cameraState(page)
  const member = home.member!
  await callStore(page, 'selectInOffice', { kind: 'member', id: member.id })
  await expect.poll(async () => gap((await cameraState(page)).target, member.at), { timeout: 4000 }).toBeLessThan(0.6)

  // 사용자가 휠로 줌 — 카메라를 넘겨받는다
  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.3)
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(900)
  const moved = await cameraState(page)

  await callStore(page, 'selectInOffice', null)
  await page.waitForTimeout(1500)
  const after = await cameraState(page)
  expect(gap(after.target, home.target!)).toBeGreaterThan(0.3)
  expect(Math.abs(after.dist! - moved.dist!)).toBeLessThan(0.5)
})
