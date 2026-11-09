// 폼 하나의 제출 실패 상태 (#274 — 디자인 보드 「3 · 폼 안」). 화면 조각은 ErrorStates.tsx(FormAlert · FieldError). 소유: D.
import { useEffect, useRef, useState } from 'react'
import type { DataError } from '../data/DataSource'
import { CSRF_DONE_NOTICE, CSRF_FAILED_NOTICE, writeProblem, type WriteAction, type WriteNext, type WriteProblem } from '../data/rules/errors'
import { useSession } from '../session'
import { useOffice } from '../store'

export interface WriteProblemOptions {
  /** "다시 제출" — 보안 확인을 마친 뒤 사람이 누른다. 보통 form.requestSubmit() */
  resubmit: () => void
  /** "목록 다시 불러오기"(사무실 밖 폼) */
  refreshLists?: () => void | Promise<void>
  /** "최신 상태 보기"로 Snapshot을 다시 읽은 뒤 — 평가 폼이 회차를 다시 본다 */
  afterReload?: () => void
}

/**
 * 폼 하나의 제출 실패 상태. report(오류)를 store · session 액션의 onError로 넘기면 code + 작업으로 문구를 고른다.
 * 다음 행동(act)은 사람이 누를 때만 — 결과가 불확실한 쓰기를 자동으로 다시 보내지 않는다.
 */
export function useWriteProblem(action: WriteAction, opts: WriteProblemOptions) {
  const [problem, setProblem] = useState<WriteProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })

  const report = (e: DataError) => setProblem(writeProblem(action, e))
  const clear = () => setProblem(null)
  const act = async (next: WriteNext) => {
    const o = latest.current
    if (next === 'resubmit') {
      setProblem(null)
      o.resubmit()
      return
    }
    setBusy(true)
    try {
      if (next === 'csrf') {
        const ok = await useSession.getState().confirmSecurity()
        setProblem(ok ? CSRF_DONE_NOTICE : CSRF_FAILED_NOTICE)
      } else if (next === 'reload') {
        await useOffice.getState().reloadOffice()
        setProblem(null)
        o.afterReload?.()
      } else {
        await o.refreshLists?.()
        setProblem(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return {
    problem,
    /** 입력란 아래 문구 */
    field: problem?.kind === 'field' ? problem.text : null,
    /** 폼 상단 띠 */
    notice: problem?.kind === 'notice' ? problem : null,
    busy,
    report,
    clear,
    act: (next: WriteNext) => void act(next),
  }
}
