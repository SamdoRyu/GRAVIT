// 26. 상단 바 수동 동기화 (#234 — FR-GH-03 · 05): 팀원은 동기화 칩을 눌러 POST W/sync를 보내고, 진행 중엔 다시 보내지 않는다.
// 강사는 눌러도 설명만 본다(서버는 403 forbidden_role로 다시 검사 — 계약 테스트). mock의 동기화는 잠깐 running 뒤 idle.
import { expect, openApp, readStore, test } from './fixtures'

const syncChip = (page: import('@playwright/test').Page) => page.getByRole('banner').locator('.sync-status')

test('a member presses the sync chip: running, no second request while running, then back to synced', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const chip = syncChip(page)
  await expect(chip).toHaveAccessibleName(/눌러서 지금 동기화$/)
  const before = await readStore(page, (s) => s.office.snapshot.sync.lastSucceededAt)

  await chip.click()
  await expect(chip).toHaveAccessibleName(/^동기화 중/)
  await chip.click() // 진행 중 — 설명만, conflict 알림 없음
  await expect(page.getByText('이미 동기화 중이에요')).toHaveCount(0)

  await expect(chip).toHaveAccessibleName(/^방금 동기화/)
  expect(await readStore(page, (s) => s.office.snapshot.sync.lastSucceededAt)).not.toBe(before)
})

test('an instructor sees the explanation only, without starting a sync', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  await page.evaluate(async () => {
    const path = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ path)
    const o = useOffice.getState().office
    useOffice.setState({ office: { ...o, snapshot: { ...o.snapshot, viewer: { ...o.snapshot.viewer, role: 'instructor', memberId: null } } } })
  })
  const chip = syncChip(page)
  await expect(chip).not.toHaveAccessibleName(/눌러서 지금 동기화/)
  await chip.click()
  await expect(chip).not.toHaveAccessibleName(/^동기화 중/)
  expect(await readStore(page, (s) => s.office.snapshot.sync.state)).toBe('idle')
})
