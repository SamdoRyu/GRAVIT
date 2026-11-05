// 12. Touch (1024x768, touch screen, no mobile emulation): a quick swipe on a card in the drawer scrolls the list
// and never starts a drag.
// v1 사무실의 칸반 카드는 읽기 전용이라(#102 T5-c-2) 길게 눌러 열을 옮기는 데모 검사는 뺐다 — 스와이프가 끌기로 바뀌지 않는지만 본다.
// Touch is driven with CDP Input.dispatchTouchEvent (Playwright only offers taps).
import type { CDPSession, Locator, Page } from '@playwright/test'
import { expect, openApp, readStore, test } from './fixtures'

test.use({ hasTouch: true, isMobile: false, viewport: { width: 1024, height: 768 } })

type Pt = { x: number; y: number }
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] })

async function center(loc: Locator): Promise<Pt> {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  if (!b) throw new Error('no box')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: '관리 패널', exact: true }).tap()
  await expect(page.getByRole('region', { name: '관리 패널' })).toBeVisible()
}

test('a quick swipe on a card scrolls the list and does not drag', async ({ page, context, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  await openDrawer(page)
  const drawer = page.getByRole('region', { name: '관리 패널' })
  const body = drawer.locator('.panel-body')
  const card = drawer.getByRole('article', { name: /^이슈 #5 / })
  await expect(card).toBeVisible()
  const scrollBefore = await body.evaluate((el) => el.scrollTop)

  const cdp = await context.newCDPSession(page)
  const from = await center(card)
  await touch(cdp, 'touchStart', from)
  for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', { x: from.x, y: from.y - i * 30 })
  expect(await readStore(page, (s) => s.drag), 'no drag during a swipe').toBeNull()
  await touch(cdp, 'touchEnd')

  await expect.poll(() => body.evaluate((el) => el.scrollTop), { message: 'the list scrolled' }).toBeGreaterThan(scrollBefore)
  expect(await readStore(page, (s) => s.drag)).toBeNull()
})
