// PR 상세의 추천 · 비추천 평가 (#19 · #20 — FR-LRN-01 · 02 · 03, CONTRACTS_API.md 「9」). 소유: D.
// 이유는 평가자 없이 보인다(익명). 사람별 평가 합계 · 순위는 없다(FR-FLOW-06 · #29).
import { useRef, useState, type FormEvent } from 'react'
import { EVALUATION_REASON_MAX, VERDICT_LABEL, cannotEvaluateReason, evaluationError, reasonLength, sameAsMine } from '../data/rules/evaluation'
import type { EvaluationReason, EvaluationRoundDto, SubmissionDto, Verdict } from '../data/types'
import { useOffice } from '../store'
import { FieldError, FormAlert } from './ErrorStates'
import { useWriteProblem } from './useWriteProblem'
import { relativeTime } from './format'
import { useNow } from './hooks'

const OPENED_REASON: Record<EvaluationRoundDto['openedReason'], string> = {
  new_pr: '새 PR',
  new_commit: '새 커밋',
  meeting_reevaluate: '회의에서 다시 평가',
}

function Reasons({ reasons }: { reasons: readonly EvaluationReason[] }) {
  if (reasons.length === 0) return <p className="dim small dnote">아직 남긴 이유가 없어요.</p>
  return (
    <ul className="eval-reasons">
      {reasons.map((r, i) => (
        <li key={i}>
          <span className={`verdict verdict-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
          <span className="eval-reason">{r.reason}</span>
        </li>
      ))}
    </ul>
  )
}

function RoundSummary({ round }: { round: EvaluationRoundDto }) {
  return (
    <p className="dround">
      {round.roundNumber}회차 · {OPENED_REASON[round.openedReason]} · 추천 <b>{round.recommendCount}</b> · 비추천 <b>{round.notRecommendCount}</b>
    </p>
  )
}

/**
 * 작성 중인 평가 — PR 상세(EvaluationSection)가 갖는다. 회차가 바뀌거나 PR이 닫혀 폼이 다시 그려져도 쓴 이유를 잃지 않게 (#274).
 * dirty = 사람이 고르거나 고쳤다(저장하면 false)
 */
interface Draft {
  verdict: Verdict | null
  reason: string
  dirty: boolean
}
const draftOf = (round: EvaluationRoundDto | null): Draft => ({ verdict: round?.myEvaluation?.verdict ?? null, reason: round?.myEvaluation?.reason ?? '', dirty: false })

function EvaluateForm({ submissionId, round, draft, setDraft, onSaved }: { submissionId: string; round: EvaluationRoundDto; draft: Draft; setDraft: (d: Draft) => void; onSaved: () => void }) {
  const mine = round.myEvaluation
  const { verdict, reason } = draft
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const now = useNow()
  // 실패해도 쓴 이유는 그대로 — 입력 오류는 입력란 아래, 권한 · 회차 변경 · 보안 확인은 폼 위 띠. 다시 보내기는 사람이 누른다
  const w = useWriteProblem('evaluate', { resubmit: () => formRef.current?.requestSubmit() })

  const length = reasonLength(reason)
  const error = verdict === null ? '추천 · 비추천 중 하나를 골라 주세요' : evaluationError({ verdict, reason })
  // 길이 초과는 바로, 그 밖의 오류는 제출할 때 보인다. 화면 검사를 통과한 뒤 서버가 입력 오류(400)를 주면 그 문구
  const shownError = (submitted || length > EVALUATION_REASON_MAX ? error : null) ?? w.field
  const unchanged = verdict !== null && sameAsMine(mine, verdict, reason)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || verdict === null || busy || unchanged) return
    setBusy(true)
    w.clear()
    const st = useOffice.getState()
    // 회차가 바뀌었거나 PR이 닫혔으면(409) store가 Snapshot을 다시 읽는다 — 쓴 이유는 draft에 남는다
    const saved = await st.evaluateSubmission(submissionId, { roundId: round.id, verdict, reason: reason.trim() }, w.report)
    setBusy(false)
    if (saved) {
      st.toast('good', mine ? '평가를 바꿨어요' : '평가를 남겼어요')
      setSubmitted(false)
      setDraft({ verdict, reason: saved.myEvaluation?.reason ?? reason.trim(), dirty: false })
      onSaved()
    }
  }

  return (
    <form ref={formRef} className="eval-form err-ui" onSubmit={submit} noValidate aria-label="내 평가">
      {w.notice && <FormAlert notice={w.notice} busy={w.busy} onAction={w.act} />}
      {mine && (
        <p className="dim small dnote">
          내 평가: {VERDICT_LABEL[mine.verdict]} · {relativeTime(mine.updatedAt, now)}
        </p>
      )}
      <div className="eval-verdicts" role="radiogroup" aria-label="추천 · 비추천">
        {(['recommend', 'not_recommend'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={verdict === v} className={`btn btn-sm verdict-btn verdict-btn-${v}${verdict === v ? ' is-on' : ''}`} onClick={() => setDraft({ ...draft, verdict: v, dirty: true })}>
            {VERDICT_LABEL[v]}
          </button>
        ))}
      </div>
      <label className="fld">
        <span className="fld-label">
          한 줄 이유 <span className={`eval-count${length > EVALUATION_REASON_MAX ? ' is-over' : ''}`}>{length}/{EVALUATION_REASON_MAX}</span>
        </span>
        <input
          className="select"
          type="text"
          value={reason}
          placeholder={verdict === 'not_recommend' ? '무엇을 고치면 좋을까요?' : '무엇이 좋았나요?'}
          aria-invalid={!!shownError}
          aria-describedby={shownError ? `eval-error-${submissionId}` : undefined}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value, dirty: true })}
        />
      </label>
      {shownError && <FieldError id={`eval-error-${submissionId}`} text={shownError} />}
      <div className="eval-actions">
        <span className="dim small">이유는 평가자 이름 없이 보여요</span>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || unchanged}>
          {mine ? '평가 바꾸기' : '평가 남기기'}
        </button>
      </div>
    </form>
  )
}

function PastRounds({ submissionId, currentId }: { submissionId: string; currentId: string }) {
  const [rounds, setRounds] = useState<EvaluationRoundDto[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (rounds === null) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const got = await useOffice.getState().loadRounds(submissionId)
          setBusy(false)
          if (got) setRounds(got)
        }}
      >
        지난 회차 보기
      </button>
    )
  }
  const past = rounds.filter((r) => r.id !== currentId)
  if (past.length === 0) return <p className="dim small dnote">지난 회차가 없어요.</p>
  return (
    <div className="eval-past">
      {past.map((r) => (
        <div key={r.id} className="eval-round">
          <RoundSummary round={r} />
          <Reasons reasons={r.reasons} />
        </div>
      ))}
    </div>
  )
}

/** PR 상세의 평가 칸 — 현재 회차 요약 · 이유, 입력(평가할 수 있을 때), 지난 회차 */
export function EvaluationSection({ submission, viewerMemberId }: { submission: SubmissionDto; viewerMemberId: string | null }) {
  const round = submission.currentRound
  const why = cannotEvaluateReason(submission, viewerMemberId)
  const [draft, setDraft] = useState<Draft>(() => draftOf(round))
  const [seenRound, setSeenRound] = useState(round?.id ?? null)
  const [roundChanged, setRoundChanged] = useState(false)
  // 회차가 바뀌면 입력을 새로 시작한다 — 다만 쓰던 이유가 있으면 지우지 않고 "새 회차가 열렸어요"를 보인다 (#274)
  if ((round?.id ?? null) !== seenRound) {
    setSeenRound(round?.id ?? null)
    if (draft.dirty) setRoundChanged(true)
    else setDraft(draftOf(round))
  }
  if (!round) return <p className="dim small dnote">{why}</p>
  const kept = draft.dirty && draft.reason.trim() !== ''
  return (
    <div className="eval">
      <RoundSummary round={round} />
      <Reasons reasons={round.reasons} />
      {round.canEvaluate ? (
        <>
          {roundChanged && (
            <FormAlert
              notice={{ kind: 'notice', tone: 'warn', title: `새 평가 회차(${round.roundNumber}회차)가 열렸어요`, body: '작성하던 이유는 그대로 두었어요. 위의 최신 회차 내용을 확인한 뒤 다시 제출해 주세요.', next: null }}
              extra={
                <button type="button" className="err-btn-ghost" onClick={() => setRoundChanged(false)}>
                  확인했어요
                </button>
              }
            />
          )}
          <EvaluateForm key={round.id} submissionId={submission.id} round={round} draft={draft} setDraft={setDraft} onSaved={() => setRoundChanged(false)} />
        </>
      ) : kept ? (
        // PR이 머지 · 닫혔다 — 평가는 더 못 남기지만 쓰던 이유는 보여 준다(복사할 수 있게)
        <div className="eval-kept err-ui">
          <FormAlert notice={{ kind: 'notice', tone: 'warn', title: '이 PR은 더 평가할 수 없어요', body: `${why} 작성하던 이유는 아래에 남겨 두었어요.`, next: null }} />
          <p className="err-kept" aria-label="작성하던 이유">
            {draft.verdict ? `${VERDICT_LABEL[draft.verdict]} · ` : ''}
            {draft.reason}
          </p>
        </div>
      ) : (
        <p className="dim small dnote">{why}</p>
      )}
      {round.roundNumber > 1 && <PastRounds key={round.id} submissionId={submission.id} currentId={round.id} />}
    </div>
  )
}
