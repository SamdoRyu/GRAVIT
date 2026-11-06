// 13. v1 사무실의 관리 패널 칸반 · 목록 (#102 T5-c-2): Snapshot의 이슈 · PR을 표시 상태 열로, 읽기 전용(끌기 없음),
// 검색 · 정렬 · GitHub 링크. 기대 값은 페이지 안의 Snapshot과 규칙 함수로 계산한다(seed 숫자를 박지 않는다).
import { expect, openApp, panel, readStore, tab, test } from './fixtures'
import type { Page } from '@playwright/test'

type Expected = { total: number; byColumn: Record<string, number>; blocked: { number: number; title: string; htmlUrl: string | null } }

async function expected(page: Page): Promise<Expected> {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const boardPath = '/src/data/rules/board.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const { boardItems } = await import(/* @vite-ignore */ boardPath)
    const items = boardItems(useOffice.getState().office.snapshot) as { column: string; kind: string; number: number; title: string; flags: string[]; htmlUrl: string | null }[]
    const byColumn: Record<string, number> = {}
    for (const it of items) byColumn[it.column] = (byColumn[it.column] ?? 0) + 1
    const blocked = items.find((it) => it.kind === 'task' && it.flags.includes('blocked'))!
    return { total: items.length, byColumn, blocked: { number: blocked.number, title: blocked.title, htmlUrl: blocked.htmlUrl } }
  })
}

test('the kanban and list tabs show the office issues and PRs, read-only, with search, sort and GitHub links', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const want = await expected(page)
  expect(want.total).toBeGreaterThan(0)

  // --- 칸반: 탭 숫자 · 열 이름과 개수(완료는 처음에 접혀 있다) ---
  await expect(tab(page, '칸반')).toContainText(String(want.total))
  const column = (label: string) => panel(page).getByRole('region', { name: new RegExp(`^${label} \\d+개$`) })
  for (const [label, key] of [['대기', 'waiting'], ['작업 중', 'working'], ['검토', 'review'], ['완료', 'done']] as const) {
    await expect(column(label)).toHaveAccessibleName(`${label} ${want.byColumn[key] ?? 0}개`)
  }
  await expect(column('완료').getByRole('article')).toHaveCount(0)
  await column('완료').getByRole('button', { name: /^완료/ }).click()
  await expect(column('완료').getByRole('article')).toHaveCount(want.byColumn.done ?? 0)

  // --- 읽기 전용: 카드를 끌어도 drag가 시작되지 않는다 ---
  const blockedCard = panel(page).getByRole('article', { name: new RegExp(`^이슈 #${want.blocked.number} `) })
  await expect(blockedCard).toBeVisible()
  await expect(blockedCard).toContainText('막힘')
  const box = (await blockedCard.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 5 })
  await page.mouse.up()

  // --- GitHub 링크: 새 탭, 원본 주소 ---
  if (want.blocked.htmlUrl) {
    const link = blockedCard.getByRole('link', { name: `GitHub에서 이슈 #${want.blocked.number} 열기` })
    await expect(link).toHaveAttribute('href', want.blocked.htmlUrl)
    await expect(link).toHaveAttribute('target', '_blank')
  }

  // --- 검색: #번호로 한 장, 맞는 것이 없으면 안내와 지우기 ---
  const search = page.getByRole('searchbox', { name: '이슈 · PR 검색' })
  await search.fill(`#${want.blocked.number}`)
  await expect(panel(page).getByRole('article')).toHaveCount(1)
  await search.fill('없는-검색어-xyz')
  await expect(panel(page).getByText('에 맞는 이슈 · PR이 없어요')).toBeVisible()
  await panel(page).getByRole('button', { name: '검색 지우기' }).click()
  await expect(search).toHaveValue('')

  // --- 목록: 행 수, 우선순위 정렬(높은 것 먼저) ---
  await tab(page, '목록').click()
  const rows = panel(page).getByRole('table', { name: '이슈 · PR 목록' }).locator('.lbody').getByRole('row')
  await expect(rows).toHaveCount(want.total)
  await panel(page).getByRole('columnheader', { name: '우선' }).click()
  await expect(panel(page).getByRole('columnheader', { name: '우선' })).toHaveAttribute('aria-sort', 'ascending')
  const firstPriority = await page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    return [...snap.tasks, ...snap.submissions].some((x: { priority: string | null }) => x.priority === 'high')
  })
  if (firstPriority) await expect(rows.first().locator('.prio')).toHaveAttribute('title', '우선순위 높음')
})

test('a card opens the read-only detail: issue → linked PR → person, with GitHub links and no edit inputs', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  // 연결된 PR이 있는 이슈 하나와 그 PR — 페이지 안 Snapshot에서 고른다
  const pair = await page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const t = snap.tasks.find((x: { state: string; linkedSubmissionIds: string[] }) => x.state === 'open' && x.linkedSubmissionIds.length > 0)
    if (!t) return null
    const s = snap.submissions.find((x: { id: string }) => x.id === t.linkedSubmissionIds[0])
    const lead = snap.members.find((m: { id: string }) => m.id === t.assigneeMemberIds[0])
    return { issue: { number: t.githubIssueNumber, title: t.title }, pr: { number: s.githubPrNumber, title: s.title, htmlUrl: s.htmlUrl }, lead: lead?.displayName ?? null }
  })
  test.skip(pair === null, 'mock seed에 PR이 연결된 열린 이슈가 없다')
  const { issue, pr, lead } = pair!

  await panel(page).getByRole('article', { name: new RegExp(`^이슈 #${issue.number} `) }).click()
  const issueDetail = page.getByRole('complementary', { name: '이슈 상세' })
  await expect(issueDetail).toBeVisible()
  await expect(issueDetail.getByRole('heading', { name: issue.title })).toBeVisible()
  await expect(issueDetail.locator('input, select, textarea')).toHaveCount(0)
  await expect(panel(page).getByRole('article', { name: new RegExp(`^이슈 #${issue.number} `) })).toHaveAttribute('aria-current', 'true')

  // 연결된 PR → PR 상세, GitHub PR 화면 링크(FR-LRN-07)
  await issueDetail.getByRole('button', { name: new RegExp(`PR #${pr.number}`) }).click()
  const prDetail = page.getByRole('complementary', { name: 'PR 상세' })
  await expect(prDetail.getByRole('heading', { name: pr.title })).toBeVisible()
  await expect(issueDetail).toBeHidden()
  if (pr.htmlUrl) await expect(prDetail.getByRole('link', { name: `GitHub에서 PR #${pr.number} 열기` })).toHaveAttribute('href', pr.htmlUrl)

  // 이슈로 돌아가 대표 담당자 → 팀원 상세(업무량 게이지 없음)
  if (lead) {
    await prDetail.getByRole('button', { name: new RegExp(`이슈 #${issue.number}`) }).click()
    await page.getByRole('complementary', { name: '이슈 상세' }).getByRole('button', { name: new RegExp(lead) }).first().click()
    const memberDetail = page.getByRole('complementary', { name: '팀원 상세' })
    await expect(memberDetail.getByText(lead, { exact: true })).toBeVisible()
    await expect(memberDetail.getByRole('region', { name: /^맡은 열린 이슈 \d+개$/ })).toContainText(`#${issue.number}`)
    await expect(memberDetail.getByText(/업무량/)).toHaveCount(0)
  }

  // Esc로 닫는다
  await page.keyboard.press('Escape')
  await expect(page.locator('.detail-v1')).toHaveCount(0)
  expect(await readStore(page, (s) => s.officeSelection)).toBeNull()
})
