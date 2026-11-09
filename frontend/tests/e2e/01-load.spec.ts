// 1. Load: HUD, KPIs, the 3D canvas, and a clean console.
import { expect, openApp, readStore, test } from './fixtures'

test('loads the office: HUD, KPI numbers, 3D canvas, no console errors', async ({ page, source }) => {
  await openApp(page, source)

  // 상단 바 — GRAVIT | 지금 연 저장소 이름(team-samdo/gitvillage → gitvillage)
  await expect(page.getByRole('banner').getByText('GRAVIT', { exact: true })).toBeVisible()
  await expect(page.getByRole('banner').getByText('gitvillage', { exact: true })).toBeVisible()
  await expect(page.getByRole('tablist').getByRole('tab', { name: /^칸반/ })).toBeVisible()
  await expect(page.getByRole('region', { name: '관리 패널' })).toBeVisible()
  // 사람별 업무량 표현은 HUD에 없다 — 팀원 탭 · 업무량 오버레이 · 업무 재배정 추천 (FR-FLOW-06, #102 T5-c-2)
  await expect(page.getByRole('tablist').getByRole('tab')).toHaveText([/^칸반/, /^목록/, /^주간/, /^도움 요청/, /^스탠드업/, /^결정 기록/, /^요구사항/, /^회고/])
  // 데모 화면(오버레이 · 작업 만들기 · 데모 스위치)도 없다 — 3D가 v1이라 오버레이가 할 일이 없고, v1은 GitHub가 원본 (#102 T5-c-2)
  await expect(page.getByRole('radiogroup', { name: '화면 오버레이' })).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('button', { name: /^작업/ })).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('switch')).toHaveCount(0)
  await expect(page.locator('.hud-top')).not.toContainText('업무량')
  await expect(page.locator('.hud-top')).not.toContainText('추천')
  await expect(page.locator('canvas')).toBeVisible()
  const box = await page.locator('canvas').boundingBox()
  expect(box?.width).toBeGreaterThan(800)

  // v1 사무실(#102 T5-c-1): mock은 팀 사무실을 열고, 상단 바 지표는 그 Snapshot의 팀 값이다.
  await expect.poll(() => readStore(page, (s) => s.office?.status)).toBe('ready')
  const flow = await readStore(page, (s) => s.office!.snapshot!.flow)
  expect(await readStore(page, (s) => s.office!.snapshot!.workspace.kind)).toBe('github')
  const kpis = page.locator('.kpis')
  const value = (label: string) => kpis.locator('.kpi', { hasText: label }).locator('.kpi-value')
  await expect(value('열린 PR')).toHaveText(String(flow.openSubmissionCount))
  await expect(kpis.locator('.kpi').first().locator('.kpi-label')).toHaveText(/^(시작 전|종료까지|오늘 종료|종료됨)$/)

  // 서버에 붙으면 상단 바에 "서버" 배지 (v1 연결 상태 — #164)
  if (source === 'api') await expect(page.getByText('서버', { exact: true })).toBeVisible()
  // 데모 모델은 없다 — 사무실 데이터는 v1 Snapshot뿐 (#102 ④)
  expect(await readStore(page, (s) => 'tasks' in s || 'members' in s || 'init' in s)).toBe(false)
})
