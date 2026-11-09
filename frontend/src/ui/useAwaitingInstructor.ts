// 강사 답변 판정 훅 (#290 — rules/help). 둘 다 문자열로 골라 Set으로 — 같은 값이면 다시 그리지 않는다(selector가 매번 새 배열을
// 돌려주지 않게).
import { useMemo } from 'react'
import { awaitingInstructor, unreadInstructorAnswers } from '../data/rules/help'
import type { Id } from '../data/types'
import { useOffice } from '../store'

const toSet = (key: string): ReadonlySet<Id> => new Set(key ? key.split('\n') : [])

/** 강사 답변을 기다리는 도움 요청 — 3D 강사 우주선(scene/InstructorShip)이 이 값을 보고 오고 간다 */
export function useAwaitingInstructor(): ReadonlySet<Id> {
  const key = useOffice((s) => (s.office?.snapshot ? awaitingInstructor(s.office.snapshot.helpRequests, s.instructorAnswers).join('\n') : ''))
  return useMemo(() => toSet(key), [key])
}

/**
 * 새 강사 답변이 있는 도움 요청 — 도움 요청 탭 · 목록의 글 · 3D 게시판 알약의 빨간 점. 팀원마다 따로, 그 글 상세를 열어 보면 꺼진다.
 * 강사 본인에게는 없다.
 */
export function useUnreadInstructorAnswers(): ReadonlySet<Id> {
  const key = useOffice((s) => {
    const snap = s.office?.snapshot
    if (!snap || snap.viewer.role === 'instructor') return ''
    return unreadInstructorAnswers(snap.helpRequests, s.instructorAnswers, s.seenInstructorAnswers).join('\n')
  })
  return useMemo(() => toSet(key), [key])
}
