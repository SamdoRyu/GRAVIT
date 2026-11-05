// 6. Meeting on the v1 office (CONTRACTS_API.md 「10」 · #102 T5-c-2): with an issue and a PR on the agenda, start a meeting
// from the top bar, record a decision for the PR (re-evaluate → a new evaluation round), leave the issue undecided, end with
// notes → the meeting is in the minutes with that decision, and the issue stays on the agenda for the next meeting.
// Items are raised through the store (dragging shapes to the bridge comes with #26 · #30).
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

/** An open issue and an open PR from the page's Snapshot */
async function sources(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const t = snap.tasks.find((x: { state: string }) => x.state === 'open')
    const p = snap.submissions.find((x: { state: string; currentRound: unknown }) => x.state === 'open' && x.currentRound)
    return t && p ? { taskId: t.id as string, prId: p.id as string, prRound: p.currentRound.roundNumber as number } : null
  })
}

/** The Snapshot pieces this test checks */
async function state(page: Page, ids: { issueItem: string; prItem: string; prId: string }) {
  return page.evaluate(async (x) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const item = (id: string) => snap.agendaItems.find((a: { id: string }) => a.id === id)
    const meeting = snap.meetings[snap.meetings.length - 1]
    const pr = snap.submissions.find((s: { id: string }) => s.id === x.prId)
    return {
      meeting: meeting && { status: meeting.status, notes: meeting.notes },
      issue: item(x.issueItem)?.status,
      pr: item(x.prItem) && { status: item(x.prItem).status, prDecision: item(x.prItem).decision?.prDecision ?? null },
      round: pr?.currentRound && { number: pr.currentRound.roundNumber, reason: pr.currentRound.openedReason },
    }
  }, ids)
}

test('a v1 meeting: decide the PR item, leave the issue for next time, end with notes, see it in the minutes', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const src = await sources(page)
  test.skip(src === null, 'mock seed에 열린 이슈와 회차가 있는 열린 PR이 없다')
  const { taskId, prId, prRound } = src!

  const raise = (kind: 'issue' | 'pr', sourceId: string, title: string) =>
    callStore<{ id: string } | null>(page, 'raiseAgendaItem', { kind, sourceId, title, background: null, tried: null, unresolvedReason: null })
  const issueItem = (await raise('issue', taskId, 'E2E 이슈 안건'))!.id
  const prItem = (await raise('pr', prId, 'E2E PR 안건'))!.id
  const ids = { issueItem, prItem, prId }

  // Start from the top bar: both items are on the agenda.
  await page.getByRole('button', { name: /^회의/ }).click()
  const start = page.getByRole('dialog', { name: '회의 시작' })
  const agenda = start.getByRole('list', { name: '안건' })
  await expect(agenda).toContainText('E2E 이슈 안건')
  await expect(agenda).toContainText('E2E PR 안건')
  await start.getByRole('button', { name: '회의 시작' }).click()
  await expect(start).toBeHidden()
  await expect.poll(async () => (await state(page, ids)).meeting?.status).toBe('ongoing')

  // End dialog (the top bar's live pill moves to v1 with D's TopBar change — open it through the store meanwhile).
  const meetingId = await readStore(page, (s) => s.office.snapshot.meetings.find((m: { status: string }) => m.status === 'ongoing').id)
  await callStore(page, 'openDialog', { kind: 'endMeeting', meetingId })
  const end = page.getByRole('dialog', { name: /^회의 종료/ })
  const toDecide = end.getByRole('list', { name: '결정할 안건' })
  await toDecide.getByRole('listitem').filter({ hasText: 'E2E PR 안건' }).getByRole('button', { name: '결정하기' }).click()

  // The PR decision is required for a PR item.
  const form = end.getByRole('form', { name: 'E2E PR 안건 결정' })
  await form.getByPlaceholder('무엇으로 정했는지').fill('리뷰 반영 뒤 다시 평가')
  await form.getByRole('button', { name: '결정 기록' }).click()
  await expect(form.getByText('PR 안건은 PR 결정을 골라 주세요')).toBeVisible()
  await form.getByRole('radiogroup', { name: 'E2E PR 안건 PR 결정' }).getByRole('radio', { name: '고쳐서 다시 평가' }).click()
  await form.getByPlaceholder('팀이 이번에 배운 것').fill('작은 PR이 리뷰가 빠르다')
  await form.getByRole('button', { name: '결정 기록' }).click()

  // The PR item leaves the list and shows as decided; a new evaluation round opened.
  await expect(end.getByRole('list', { name: '이번 회의 결정' })).toContainText('리뷰 반영 뒤 다시 평가')
  await expect(toDecide).not.toContainText('E2E PR 안건')
  await expect.poll(async () => (await state(page, ids)).round).toEqual({ number: prRound + 1, reason: 'meeting_reevaluate' })

  // End with notes, the issue undecided.
  await end.getByLabel('회의록 (선택)').fill('E2E 회의 메모')
  await end.getByRole('button', { name: '회의 종료' }).click()
  await expect(end).toBeHidden()
  await expect(page.getByText('회의를 마쳤어요 · 결정 1건')).toBeVisible()
  await expect
    .poll(() => state(page, ids))
    .toEqual({ meeting: { status: 'ended', notes: 'E2E 회의 메모' }, issue: 'confirmed', pr: { status: 'discussed', prDecision: 'revise_and_reevaluate' }, round: { number: prRound + 1, reason: 'meeting_reevaluate' } })

  // The minutes show the meeting with the decision and the notes.
  await page.getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '회의록' }).click()
  const minutes = page.getByRole('dialog', { name: '회의록' })
  const entry = minutes.getByRole('listitem').filter({ hasText: 'E2E 회의 메모' }).first()
  await expect(entry).toBeVisible()
  await expect(entry.getByText('결정 1건')).toBeVisible()
  await expect(entry.getByText('리뷰 반영 뒤 다시 평가')).toBeVisible()
  await expect(entry.getByText('고쳐서 다시 평가')).toBeVisible()
})
