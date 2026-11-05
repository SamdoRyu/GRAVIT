// 4. Assigning across the panel / 3D boundary: 3D task box -> a member card in the team tab (and back to the backlog strip).
// 칸반 카드 -> 3D 책상 끌기는 뺐다 — v1 사무실의 칸반은 GitHub 이슈 · PR 읽기 전용이라 끌어서 담당을 바꾸지 않는다
// (2026-10-28 결정, #102 T5-c-2). 3D 상자 · 팀원 탭은 아직 데모 데이터다.
import { expect, openApp, panel, pickUpBoxOverElement, seedTask, serverTask, tab, taskByTitle, test } from './fixtures'

const MEMBER = 'm_5' // 정유진 works at her desk, so her bot is in the scene

test('dragging a 3D box onto a member card in the team tab assigns the task', async ({ page, source, api }) => {
  await openApp(page, source)
  const task = await seedTask(page, { title: 'E2E 팀 탭 배정', status: 'todo' })
  await tab(page, '팀원').click()
  const memberCard = panel(page).getByRole('button', { name: /정유진/ })
  await expect(memberCard).toBeVisible()

  await pickUpBoxOverElement(page, task.id, memberCard, { kind: 'member', id: MEMBER })
  await page.mouse.up()
  await expect.poll(async () => (await taskByTitle(page, 'E2E 팀 탭 배정')).assigneeId).toBe(MEMBER)
  if (source === 'api') await expect.poll(async () => (await serverTask(api, task.id))?.assigneeId).toBe(MEMBER)

  // And back to the backlog by dropping on the backlog strip at the top of the team tab.
  await pickUpBoxOverElement(page, task.id, panel(page).getByText(/^백로그/), { kind: 'backlog' })
  await page.mouse.up()
  await expect.poll(async () => (await taskByTitle(page, 'E2E 팀 탭 배정')).assigneeId).toBeNull()
  if (source === 'api') await expect.poll(async () => (await serverTask(api, task.id))?.assigneeId).toBeNull()
})
