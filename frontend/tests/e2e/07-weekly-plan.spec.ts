// 7. Weekly tab (FR-PLAN-02 · #39): a read-only member x day board. A chip sits in its assignee's row on its due date;
// there are no points / workload bars, and pulling a chip changes nothing (no drag to change the due date or assignee).
import { centerOf, expect, openApp, panel, readStore, seedTask, tab, taskByTitle, test } from './fixtures'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Local date of weekday `n` (0 = Monday) of the current week, the same week the grid shows. */
function weekday(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n)
  return iso(d)
}

test('the weekly board shows chips by assignee and due date, without points, and chips do not drag', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await seedTask(page, { title: 'E2E 주간 칩', assigneeId: 'm_1', dueDate: weekday(1), estimate: 2 })

  await tab(page, '주간').click()
  const row = (name: string) => panel(page).locator('.wk-row').filter({ hasText: name })
  // Columns of the current week: 0 = 지연, 1..5 = 월..금, 6 = 주말.
  const cell = (name: string, weekdayIndex: number) => row(name).locator('.wk-cell').nth(weekdayIndex + 1)
  const chip = cell('김하늘', 1).getByRole('button', { name: /E2E 주간 칩/ })
  await expect(chip).toBeVisible()

  // No per-person points, capacity or workload bar anywhere on the board (P6 · NFR-06).
  const board = panel(page).locator('.wk')
  await expect(board).not.toContainText(/\d+\s*pt\b/)
  await expect(board.locator('.wl-bar')).toHaveCount(0)
  await expect(row('김하늘').locator('.wk-label')).not.toContainText(/\d/)

  // Pulling the chip to another day in another row: no drag starts, nothing changes.
  const a = await centerOf(chip)
  const b = await centerOf(cell('정유진', 3))
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 8, a.y + 8)
  await page.mouse.move(b.x, b.y, { steps: 10 })
  expect(await readStore(page, (s) => s.drag)).toBeNull()
  await page.mouse.up()
  const after = await taskByTitle(page, 'E2E 주간 칩')
  expect(after.dueDate).toBe(weekday(1))
  expect(after.assigneeId).toBe('m_1')
  await expect(cell('김하늘', 1).getByRole('button', { name: /E2E 주간 칩/ })).toBeVisible()

  // A click still opens the task.
  await chip.click()
  expect(await readStore(page, (s) => s.selection)).toEqual({ kind: 'task', id: after.id })
})
