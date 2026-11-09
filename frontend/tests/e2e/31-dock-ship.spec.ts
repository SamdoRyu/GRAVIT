// 31. 사무실 바꾸기 — 도킹 베이의 우주선 (팀 결정 2026-11-09, scene/DockShip.tsx): 누르면 갈 수 있는 다른 정거장 목록(지금 사무실은
// 빼고)이 뜨고, 고르면 우주선이 떠나 화면 밖으로 갔다가 새 정거장(같은 모델의 다른 사무실)에 들어와 붙는다. 처음 도착 장면은 없다.
import type { Page } from '@playwright/test'
import { expect, openApp, openShip, readStore, test } from './fixtures'

const shipFlight = (page: Page) =>
  page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return rt.shipLive.flight as 'depart' | 'arrive' | null
  })

test('the docking ship lists the other stations and flies to the chosen one', async ({ page, source }) => {
  test.skip(source !== 'mock', 'mock seed의 두 사무실(팀 · 시연) 사이를 옮긴다')
  await openApp(page, source)
  const from = await readStore(page, (s) => s.office.workspaceId)

  const list = await openShip(page)
  // 지금 사무실은 목록에 없고, 사무실 고르기 화면으로 가는 버튼이 있다
  await expect(list.getByRole('list', { name: '갈 수 있는 정거장' }).getByRole('button')).toHaveCount(1)
  await expect(list.getByRole('button', { name: '정거장 목록 화면으로' })).toBeVisible()
  // Escape로 닫고 다시 연다
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  const again = await openShip(page)

  await again.getByRole('list', { name: '갈 수 있는 정거장' }).getByRole('button').first().click()
  await expect(again).toBeHidden()
  await expect.poll(() => shipFlight(page)).toBe('depart')
  // 떠나는 동안은 아직 원래 사무실
  expect(await readStore(page, (s) => s.office.workspaceId)).toBe(from)
  // 화면 밖으로 나가면 사무실이 바뀌고 우주선이 들어온다
  await expect.poll(() => readStore(page, (s) => s.office.workspaceId), { timeout: 8000 }).not.toBe(from)
  await expect.poll(() => shipFlight(page)).toBe('arrive')
  await expect.poll(() => shipFlight(page), { timeout: 8000 }).toBe(null)
  expect(await readStore(page, (s) => s.office.status)).toBe('ready')
  await expect(page.locator('.landing')).toHaveCount(0)
})
