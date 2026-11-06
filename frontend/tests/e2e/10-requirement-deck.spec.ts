// 10. The requirement deck (#16 · #17 — CONTRACTS.md 「8」 요구사항 판 배치): each active requirement is a plate on the deck,
// in document order; a plate shows its source key and progress, an empty zone says "연결 없음", and past ten requirements
// the last place is the waiting plate ("대기 ×N · 빈 구역 k"). The mock seed has no requirements yet (#197), so the test
// puts them into the open office's Snapshot.
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

/** Replace the open office's requirements: n active ones (every third has no linked issue) and one missing */
async function setRequirements(page: Page, n: number) {
  await page.evaluate(async (count) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const s = useOffice.getState()
    const requirements = Array.from({ length: count }, (_, i) => ({
      id: String(500 + i),
      sourceKey: `FR-E2E-${String(i + 1).padStart(2, '0')}`,
      title: `E2E 요구사항 ${i + 1}`,
      position: i,
      status: 'active',
      linkedTaskCount: i % 3 === 0 ? 0 : 2,
      doneTaskCount: i % 3 === 2 ? 2 : 1,
      lastSeenAt: '2026-11-06T00:00:00Z',
    }))
    requirements.push({ ...requirements[0], id: '599', sourceKey: 'FR-E2E-99', title: '사라진 요구사항', position: 99, status: 'missing' })
    useOffice.setState({ office: { ...s.office, snapshot: { ...s.office.snapshot, requirements } } })
  }, n)
}

/** Names of the requirement plates in the 3D scene */
function plates(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const names: string[] = []
    rt.sceneApi.get().scene.traverse((o: { name: string }) => {
      if (o.name.startsWith('requirement:')) names.push(o.name)
    })
    return names
  })
}

test('requirement plates in document order, empty zones, and the waiting plate past ten', async ({ page, source }) => {
  await openApp(page, source)

  const tags = page.locator('[data-plate-tag]')

  // 7 requirements → 7 plates in document order; the missing one is not on the deck
  await setRequirements(page, 7)
  await expect.poll(() => plates(page)).toEqual(Array.from({ length: 7 }, (_, i) => `requirement:${500 + i}`))
  await expect(tags).toHaveCount(7)
  await expect(tags.nth(1)).toContainText('FR-E2E-02 · 1/2')
  await expect(tags.nth(1)).toContainText('E2E 요구사항 2')
  await expect(tags.nth(2)).toContainText('FR-E2E-03 · 2/2')
  await expect(tags.filter({ hasText: '연결 없음' })).toHaveCount(3)
  await expect(tags.filter({ hasText: '사라진 요구사항' })).toHaveCount(0)

  // 12 → 9 plates + the waiting plate (3 waiting, one of them without a linked issue)
  await setRequirements(page, 12)
  await expect.poll(async () => (await plates(page)).length).toBe(9)
  await expect(tags).toHaveCount(10)
  const waiting = tags.filter({ hasText: '대기 ×3' })
  await expect(waiting).toHaveCount(1)
  await expect(waiting).toContainText('빈 구역 1')
})
