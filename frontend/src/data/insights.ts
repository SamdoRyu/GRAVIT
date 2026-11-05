// Manager insights: member status signal (the Sims-style diamond). Pure functions shared by scene/ and ui/.
// 업무량 게이지(memberVitals) · 업무 재배정 추천(suggestActions)은 v1에서 뺐다 — FR-FLOW-06 (#102 T5-c-2).
// 신호 다이아(아바타 위)는 3D(C)가 v1으로 옮길 때 정리한다.
import type { Id, Member, Task } from './types'
import { daysUntilDue, isOverdue, tasksOf, todayIso, workload } from './selectors'

// ---- Status signal (diamond above the avatar) -------------------------------

export type SignalLevel = 'ok' | 'busy' | 'alert'

export const SIGNAL_META: Record<SignalLevel, { label: string; color: string }> = {
  ok: { label: '여유', color: '#22b07d' },
  busy: { label: '바쁨', color: '#f0a020' },
  alert: { label: '주의', color: '#e5484d' },
}

export interface MemberSignal {
  level: SignalLevel
  /** Korean, most important first, e.g. ["지연 1건", "업무량 140%"]. Empty when ok. */
  reasons: string[]
}

export function memberSignal(member: Member, tasks: Record<Id, Task>, today = todayIso()): MemberSignal {
  const mine = tasksOf(tasks, member.id)
  const w = workload(member, tasks)
  const overdue = mine.filter((t) => isOverdue(t, today)).length
  const dueSoon = mine.filter((t) => {
    const d = daysUntilDue(t, today)
    return d !== null && d >= 0 && d <= 2
  }).length
  const pct = `${Math.round(w * 100)}%`
  const reasons: string[] = []
  let level: SignalLevel = 'ok'
  if (overdue > 0) reasons.push(`지연 ${overdue}건`)
  if (w > 1.3) reasons.push(`업무량 ${pct}`)
  if (reasons.length) level = 'alert'
  else {
    if (w > 1.0) reasons.push(`업무량 ${pct}`)
    if (dueSoon > 0) reasons.push(`마감 임박 ${dueSoon}건`)
    if (reasons.length) level = 'busy'
  }
  return { level, reasons }
}
