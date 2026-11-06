// 19. A help request raised as a meeting agenda item (#205 — FR-LRN-19) sits on the bridge table as the design's sphere.
// Hovering names it "안건 · 도움 요청"; a click opens that help request in the panel's 도움 요청 tab (not the issue drawer).
import type { Page } from '@playwright/test'
import { callStore, expect, hoverBox, openApp, readStore, test, waitForScene } from './fixtures'

/** The viewer's own open (or discussing) help request — only the requester can raise it */
function myOpenHelpRequest(page: Page) {
  return readStore(page, (s) => {
    const snap = s.office.snapshot
    const h = snap.helpRequests.find(
      (x: { requesterMemberId: string; status: string }) => x.requesterMemberId === snap.viewer.memberId && (x.status === 'open' || x.status === 'discussing'),
    )
    return h ? { id: h.id as string, content: h.content as string } : null
  })
}

function drawn(page: Page, key: string) {
  return page.evaluate(async (k) => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return rt.boxLive.has(k) as boolean
  }, key)
}

test('a help request raised to the agenda is a sphere on the bridge table; a click opens it in the panel', async ({ page, source }) => {
  await openApp(page, source)
  const help = await myOpenHelpRequest(page)
  test.skip(help === null, 'mock seed에 보는 사람의 열린 도움 요청이 없다')

  const item = await callStore<{ id: string; kind: string } | null>(page, 'convertHelpRequestToAgenda', help!.id, 'E2E 도움 요청 안건')
  expect(item?.kind).toBe('help_request')
  const key = `agenda:${item!.id}`
  await expect.poll(() => drawn(page, key), { message: 'sphere on the table' }).toBe(true)
  expect(await readStore(page, (s) => s.office.snapshot.helpRequests.find((h: { id: string }) => h.id === s.office.snapshot.agendaItems.at(-1)?.source?.id)?.status)).toBe('on_agenda')

  // Close the panel first, so opening it from the sphere is visible.
  await page.evaluate(async () => {
    const uiPath = '/src/ui/uiState.ts'
    const { useUi } = await import(/* @vite-ignore */ uiPath)
    useUi.getState().setPanelOpen(false)
  })
  // Closing the panel re-centres the view: wait until the camera stands still before aiming at the sphere.
  await waitForScene(page)
  const at = await hoverBox(page, key)
  await expect(page.getByText('안건 · 도움 요청', { exact: true })).toBeVisible()
  await expect(page.getByText('E2E 도움 요청 안건', { exact: true })).toBeVisible()

  await page.mouse.click(at.x, at.y)
  const panel = page.getByRole('region', { name: '관리 패널' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^도움 요청/ })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('region', { name: '도움 요청 상세' })).toContainText(help!.content.split('\n')[0].slice(0, 20))
  expect(await readStore(page, (s) => s.officeSelection)).toBeNull()
})
