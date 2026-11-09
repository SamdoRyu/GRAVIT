// 24. 컨벤션 라이브러리 (#225 — FR-LIB-01 · 02): 상단 바 더보기 → "컨벤션 라이브러리". 로그인한 누구나 target · name 순 목록과
// 상세를 보고, GitHub 계정 강사만 등록 · 편집한다(지우기 없음). mock에는 GitHub 강사 계정이 없어 서버(mock)가 쓰기를 forbidden_role로
// 거부한다 — 그래서 두 번째 테스트는 화면의 세션만 강사로 바꿔 폼과 거부 알림을 본다(등록 · 편집 성공은 백엔드 통합 테스트).
import type { Page } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

async function openLibrary(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: '더보기' }).click()
  await page.getByRole('menuitem', { name: '컨벤션 라이브러리' }).click()
  const dialog = page.getByRole('dialog', { name: '컨벤션 라이브러리' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('a student reads the library in target · name order and opens an item, without edit controls', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const dialog = await openLibrary(page)
  const list = dialog.getByRole('list', { name: '컨벤션 목록' })
  await expect(list.getByRole('button')).toHaveText([/브랜치 이름.*작업 브랜치 이름/, /커밋 메시지/, /PR 제목.*PR 제목 규칙/, /PR 템플릿.*PR 본문 템플릿/])
  await expect(dialog.getByRole('button', { name: '새 컨벤션 등록' })).toHaveCount(0)

  await list.getByRole('button', { name: /PR 제목 규칙/ }).click()
  const item = dialog.getByRole('article', { name: 'PR 제목 규칙' })
  await expect(item.getByLabel('내용', { exact: true })).toContainText('<type>(<scope>)?: <설명>')
  await expect(item).toContainText('설명은 50자 이내')
  await expect(item).toContainText('박멘토 강사가 만듦')
  await expect(item.getByRole('button', { name: '편집' })).toHaveCount(0)

  await item.getByRole('button', { name: '목록으로' }).click()
  await expect(list).toBeVisible()
})

test('a GitHub instructor sees the form; it checks lengths, and the server refusal is shown', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  // 화면만 GitHub 강사로 — mock DataSource는 여전히 학생이라 저장을 forbidden_role로 거부한다
  await page.evaluate(async () => {
    const path = '/src/session.ts'
    const { useSession } = await import(/* @vite-ignore */ path)
    const me = useSession.getState().me
    useSession.setState({ me: { ...me, isInstructor: true, accountType: 'github' } })
  })
  const dialog = await openLibrary(page)

  await dialog.getByRole('button', { name: '새 컨벤션 등록' }).click()
  const form = dialog.getByRole('form', { name: '새 컨벤션 등록' })
  await form.getByRole('combobox', { name: /^대상/ }).selectOption({ label: '이슈 템플릿' })
  await form.getByLabel('이름', { exact: true }).fill('   ')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(form.getByRole('alert')).toHaveText('이름은 1~100자로 써 주세요')

  await form.getByLabel('이름', { exact: true }).fill('버그 이슈 템플릿')
  await form.getByLabel('내용', { exact: true }).fill('## 재현 방법\n\n## 기대한 동작')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('이 작업을 할 권한이 없어요')).toBeVisible()
  await form.getByRole('button', { name: '취소' }).click()

  // 편집도 같은 폼 — 기존 값이 채워져 있다
  await dialog.getByRole('list', { name: '컨벤션 목록' }).getByRole('button', { name: /커밋 메시지 한 줄 요약/ }).click()
  await dialog.getByRole('article', { name: '커밋 메시지 한 줄 요약' }).getByRole('button', { name: '편집' }).click()
  const edit = dialog.getByRole('form', { name: '커밋 메시지 한 줄 요약 편집' })
  await expect(edit.getByLabel('이름', { exact: true })).toHaveValue('커밋 메시지 한 줄 요약')
  await expect(edit.getByRole('combobox', { name: /^대상/ })).toHaveValue('commit_message')
})

// #280: 목록은 스크롤 영역(overflow)이라 그 밖으로 나간 그림은 잘린다. 카드 테두리(바깥 1px 그림자)와
// 키보드 포커스 링(outline + offset)이 목록의 보이는 영역 안에 있어야 네 변이 다 보인다.
test('item borders and the keyboard focus ring stay inside the scrolling list (#280)', async ({ page }) => {
  await openApp(page, 'mock', { scene: false })
  const dialog = await openLibrary(page)
  const list = dialog.getByRole('list', { name: '컨벤션 목록' })
  await expect(list.getByRole('button')).toHaveCount(4)

  // 닫기(자동 포커스)에서 Shift+Tab → 마지막 카드에 키보드 포커스
  await page.keyboard.press('Shift+Tab')
  await expect(list.getByRole('button').last()).toBeFocused()

  const outside = await list.evaluate((ul) => {
    const box = ul.getBoundingClientRect()
    return [...ul.querySelectorAll<HTMLElement>('.conv-item')].map((el) => {
      const cs = getComputedStyle(el)
      const outline = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset)
      const ring = Math.max(1, outline) // 테두리 그림자는 바깥 1px
      const r = el.getBoundingClientRect()
      const over = Math.max(box.left - (r.left - ring), r.right + ring - box.right, box.top - (r.top - ring), r.bottom + ring - box.bottom)
      return { name: el.textContent, ring, over: Math.round(Math.max(0, over) * 10) / 10 }
    })
  })
  expect(outside.filter((o) => o.over > 0)).toEqual([])
  expect(outside.at(-1)?.ring).toBeGreaterThan(1) // 마지막 카드는 실제로 포커스 링을 그리고 있다
})
