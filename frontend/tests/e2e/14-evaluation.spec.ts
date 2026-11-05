// 14. PR 추천 · 비추천 평가 (#19 · #20 — FR-LRN-01 · 02): PR 상세에서 남의 열린 PR을 평가하고(이유 필수), 바꾸고,
// 내 PR · 머지된 PR에는 입력이 없다. 이유는 평가자 없이 보인다. PR은 페이지 안 Snapshot에서 상태 · 작성자로 고른다.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

type Pick = { id: string; number: number; title: string } | null

/** 조건에 맞는 PR 하나 — 'others' = 남의 열린 · Draft PR, 'mine' = 내 열린 PR, 'closed' = 머지되거나 닫힌 PR */
function pickPr(page: Page, which: 'others' | 'mine' | 'closed'): Promise<Pick> {
  return page.evaluate(async (w) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const me = snap.viewer.memberId
    type Sub = { id: string; githubPrNumber: number; title: string; state: string; authorMemberId: string | null; currentRound: unknown }
    const open = (s: Sub) => s.state === 'open' || s.state === 'draft'
    const found = (snap.submissions as Sub[]).find((s) =>
      s.currentRound !== null && (w === 'others' ? open(s) && s.authorMemberId !== me : w === 'mine' ? open(s) && s.authorMemberId === me : !open(s)),
    )
    return found ? { id: found.id, number: found.githubPrNumber, title: found.title } : null
  }, which)
}

async function openPr(page: Page, pr: NonNullable<Pick>) {
  await callStore(page, 'selectInOffice', { kind: 'submission', id: pr.id })
  const detail = page.getByRole('complementary', { name: 'PR 상세' })
  await expect(detail.getByRole('heading', { name: pr.title })).toBeVisible()
  return detail
}

test('evaluate another member’s open PR: reason required, then counted anonymously and editable', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const pr = await pickPr(page, 'others')
  test.skip(pr === null, 'mock seed에 남의 열린 PR이 없다')
  const detail = await openPr(page, pr!)
  const counts = () => page.evaluate(async (id) => {
    const storePath = '/src/store.ts'
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const r = useOffice.getState().office.snapshot.submissions.find((s: { id: string }) => s.id === id).currentRound
    return { rec: r.recommendCount, not: r.notRecommendCount }
  }, pr!.id)
  const start = await counts()

  const form = detail.getByRole('form', { name: '내 평가' })
  await expect(form).toBeVisible()
  // 이유 없이 내면 거부, 판정 없이도 거부
  await form.getByRole('button', { name: '평가 남기기' }).click()
  await expect(form.getByRole('alert')).toHaveText('추천 · 비추천 중 하나를 골라 주세요')
  await form.getByRole('radio', { name: '비추천', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('한 줄 이유를 적어 주세요')

  await form.getByRole('textbox').fill('  테스트가 없어요  ')
  await form.getByRole('button', { name: '평가 남기기' }).click()
  await expect(page.getByText('평가를 남겼어요')).toBeVisible()
  await expect.poll(counts).toEqual({ rec: start.rec, not: start.not + 1 })
  await expect(form.getByText(/^내 평가: 비추천/)).toBeVisible()
  // 이유는 평가자 이름 없이 목록에 보인다
  await expect(detail.locator('.eval-reasons li').filter({ hasText: '테스트가 없어요' })).toHaveCount(1)
  // 같은 내용이면 다시 보낼 수 없고, 바꾸면 사람당 하나로 바뀐다
  await expect(form.getByRole('button', { name: '평가 바꾸기' })).toBeDisabled()
  await form.getByRole('radio', { name: '추천', exact: true }).click()
  await form.getByRole('textbox').fill('고쳐졌어요')
  await form.getByRole('button', { name: '평가 바꾸기' }).click()
  await expect(page.getByText('평가를 바꿨어요')).toBeVisible()
  await expect.poll(counts).toEqual({ rec: start.rec + 1, not: start.not })
  await expect(detail.locator('.eval-reasons li').filter({ hasText: '테스트가 없어요' })).toHaveCount(0)
})

test('no evaluation input on my own PR or a merged / closed PR', async ({ page, source }) => {
  await openApp(page, source, { scene: false })
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  for (const [which, text] of [
    ['mine', '내 PR은 평가할 수 없어요'],
    ['closed', '머지되거나 닫힌 PR은 평가할 수 없어요'],
  ] as const) {
    const pr = await pickPr(page, which)
    if (!pr) continue
    const detail = await openPr(page, pr)
    await expect(detail.getByRole('form', { name: '내 평가' })).toHaveCount(0)
    await expect(detail.getByText(text)).toBeVisible()
  }
})
