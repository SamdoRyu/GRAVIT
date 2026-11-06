// 7. Weekly tab (FR-PLAN-02 · #39 · P14) on the v1 office: open issues by lead assignee × app due date, no points, no drag.
// The viewer sets a due date on an issue they are assigned to (it lands in their row on that day), clears it again, and
// cannot edit an issue they are not assigned to. Expected values come from the page's Snapshot (no seed numbers baked in).
import type { Page } from '@playwright/test'
import { centerOf, expect, openApp, panel, readStore, tab, test } from './fixtures'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Local date of weekday `n` (0 = Monday) of the current week, the same week the grid shows. */
function weekday(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n)
  return iso(d)
}

/** The viewer, an open issue they lead with no due date, and an open issue they are not assigned to. */
async function facts(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    type T = { id: string; githubIssueNumber: number; title: string; state: string; dueDate: string | null; assigneeMemberIds: string[] }
    const me = snap.viewer.memberId as string
    const tasks = snap.tasks as T[]
    const mine = tasks.find((t) => t.state === 'open' && t.dueDate === null && t.assigneeMemberIds[0] === me)
    const other = tasks.find((t) => t.state === 'open' && !t.assigneeMemberIds.includes(me))
    const name = snap.members.find((m: { id: string }) => m.id === me)?.displayName as string
    const pick = (t: T | undefined) => (t ? { id: t.id, number: t.githubIssueNumber, title: t.title } : null)
    return { me, name, role: snap.viewer.role as string, mine: pick(mine), other: pick(other) }
  })
}

/** The issue's app due date in the store's Snapshot */
function dueOf(page: Page, taskId: string): Promise<string | null | undefined> {
  return page.evaluate(async (id) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    return useOffice.getState().office.snapshot.tasks.find((t: { id: string }) => t.id === id)?.dueDate
  }, taskId)
}

test('the weekly board places issues by lead and due date, edits the due date for assignees, and does not drag', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const f = await facts(page)
  test.skip(f.mine === null || f.role !== 'participant', 'mock seed에 보는 사람이 대표 담당인 마감 없는 열린 이슈가 없다')
  const mine = f.mine!

  await tab(page, '주간').click()
  const board = panel(page).locator('.wk')
  // No per-person points, capacity or workload bar (P6 · NFR-06).
  await expect(board).not.toContainText(/\d+\s*pt\b/)
  await expect(board.locator('.wl-bar')).toHaveCount(0)

  // The issue has no due date: it is in the "마감 없는 이슈" list. Select it there.
  await board.getByRole('button', { name: /^마감 없는 이슈 \d+개$/ }).click()
  await board.getByRole('list', { name: '마감 없는 열린 이슈' }).getByRole('button', { name: `이슈 #${mine.number} ${mine.title}` }).click()
  await expect.poll(() => readStore(page, (s) => s.officeSelection)).toEqual({ kind: 'task', id: mine.id })

  // Set the due date to this Wednesday: the chip moves to the viewer's row, Wednesday column.
  const due = board.getByRole('region', { name: `이슈 #${mine.number} 마감` })
  await due.getByLabel('마감').fill(weekday(2))
  await due.getByRole('button', { name: '저장' }).click()
  await expect.poll(() => dueOf(page, mine.id)).toBe(weekday(2))
  const row = board.locator('.wk-row').filter({ hasText: f.name })
  // Columns of the current week: 0 = 지연, 1..5 = 월..금, 6 = 주말.
  const chip = row.locator('.wk-cell').nth(3).getByRole('button', { name: `이슈 #${mine.number} ${mine.title}` })
  await expect(chip).toBeVisible()

  // Pulling the chip elsewhere does not start a drag (no drag-to-change on the board).
  const a = await centerOf(chip)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 80, a.y + 40, { steps: 6 })
  await page.mouse.up()

  // Clear it again.
  await due.getByRole('button', { name: '마감 지우기' }).click()
  await expect.poll(() => dueOf(page, mine.id)).toBeNull()
  await expect(chip).toHaveCount(0)

  // An issue the viewer is not assigned to: no date input, only who can change it (P14).
  if (f.other) {
    await page.evaluate(async (id) => {
      const storePath = '/src/store.ts'
      const { useOffice } = await import(/* @vite-ignore */ storePath)
      useOffice.getState().selectInOffice({ kind: 'task', id })
    }, f.other.id)
    const otherDue = board.getByRole('region', { name: `이슈 #${f.other.number} 마감` })
    await expect(otherDue.getByText(/레포 관리자와 이 이슈 담당자만 바꿀 수 있어요/)).toBeVisible()
    await expect(otherDue.locator('input')).toHaveCount(0)
  }
})
