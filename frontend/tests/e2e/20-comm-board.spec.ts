// 20. The communication hub's board (#205 — CONTRACTS.md 「8」 게시판): one board object with a count tag — 열린 · 논의 중 도움
// 요청 수 and 그중 48시간 안건 후보 수. A click opens the panel's help-request list. No shape per help request.
import type { Page } from '@playwright/test'
import { expect, openApp, readStore, settled, test, waitForScene } from './fixtures'

/** Expected counts from the open office's Snapshot */
function counts(page: Page) {
  return readStore(page, (s) => {
    const live = s.office.snapshot.helpRequests.filter((h: { status: string }) => h.status === 'open' || h.status === 'discussing')
    return { help: live.length as number, candidates: live.filter((h: { isAgendaCandidate: boolean }) => h.isAgendaCandidate).length as number }
  })
}

test('the board shows the open help-request count (and candidates); a click opens the help-request list', async ({ page, source }) => {
  await openApp(page, source)
  const { help, candidates } = await counts(page)
  test.skip(help === 0, 'mock seed에 열린 도움 요청이 없다')

  const tag = page.locator('[data-board-tag]')
  await expect(tag).toHaveCount(1)
  await expect(tag).toContainText(`도움 요청 ${help}`)
  if (candidates > 0) await expect(tag).toContainText(`안건 후보 ${candidates}`)
  else await expect(tag).not.toContainText('안건 후보')

  // Close the panel, then click the board screen (comm hub back wall, design units × WORLD_SCALE 0.42).
  await page.evaluate(async () => {
    const uiPath = '/src/ui/uiState.ts'
    const { useUi } = await import(/* @vite-ignore */ uiPath)
    useUi.getState().setPanelOpen(false)
  })
  const panel = page.getByRole('region', { name: '관리 패널' })
  await expect(panel).toBeHidden()
  await waitForScene(page) // closing the panel re-centres the view
  const geometryPath = '/src/theme/station/geometry.ts'
  const screen = await page.evaluate(async (p) => {
    const g = await import(/* @vite-ignore */ p)
    return { x: g.COMM_HUB.x * g.WORLD_SCALE, y: (g.COMM_HUB.deckY + 1.45) * g.WORLD_SCALE, z: 5.1 * g.WORLD_SCALE }
  }, geometryPath)
  const at = await settled(page, { kind: 'point', ...screen })
  await page.mouse.click(at.x, at.y)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^도움 요청/ })).toHaveAttribute('aria-selected', 'true')
  expect(await readStore(page, (s) => s.officeSelection)).toBeNull()
})
