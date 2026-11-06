// 날짜 도우미 — 오늘 날짜(브라우저 시간대). 데모 모델 선택 함수(필터 · 업무량 · KPI)는 #102 ④에서 지웠다. 소유: D.

/** Local YYYY-MM-DD for "today". */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
