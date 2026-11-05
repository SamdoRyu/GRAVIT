// PR 상세의 추천 · 비추천 평가 (#19 · #20 — FR-LRN-01 · 02 · 03, CONTRACTS_API.md 「9」). 소유: D.
// 이유는 평가자 없이 보인다(익명). 사람별 평가 합계 · 순위는 없다(FR-FLOW-06 · #29).
import { useState, type FormEvent } from 'react'
import { EVALUATION_REASON_MAX, VERDICT_LABEL, cannotEvaluateReason, evaluationError, reasonLength, sameAsMine } from '../data/rules/evaluation'
import type { EvaluationReason, EvaluationRoundDto, SubmissionDto, Verdict } from '../data/types'
import { useOffice } from '../store'
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

function EvaluateForm({ submissionId, round }: { submissionId: string; round: EvaluationRoundDto }) {
  const mine = round.myEvaluation
  const [verdict, setVerdict] = useState<Verdict | null>(mine?.verdict ?? null)
  const [reason, setReason] = useState(mine?.reason ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const now = useNow()

  const length = reasonLength(reason)
  const error = verdict === null ? '추천 · 비추천 중 하나를 골라 주세요' : evaluationError({ verdict, reason })
  // 길이 초과는 바로, 그 밖의 오류는 제출할 때 보인다
  const shownError = submitted || length > EVALUATION_REASON_MAX ? error : null
  const unchanged = verdict !== null && sameAsMine(mine, verdict, reason)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || verdict === null || busy || unchanged) return
    setBusy(true)
    const st = useOffice.getState()
    const saved = await st.evaluateSubmission(submissionId, { roundId: round.id, verdict, reason: reason.trim() })
    setBusy(false)
    if (saved) {
      st.toast('good', mine ? '평가를 바꿨어요' : '평가를 남겼어요')
      setSubmitted(false)
      setReason(saved.myEvaluation?.reason ?? reason.trim())
    }
  }

  return (
    <form className="eval-form" onSubmit={submit} noValidate aria-label="내 평가">
      {mine && (
        <p className="dim small dnote">
          내 평가: {VERDICT_LABEL[mine.verdict]} · {relativeTime(mine.updatedAt, now)}
        </p>
      )}
      <div className="eval-verdicts" role="radiogroup" aria-label="추천 · 비추천">
        {(['recommend', 'not_recommend'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={verdict === v} className={`btn btn-sm verdict-btn verdict-btn-${v}${verdict === v ? ' is-on' : ''}`} onClick={() => setVerdict(v)}>
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
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {shownError && (
        <em id={`eval-error-${submissionId}`} className="fld-error" role="alert">
          {shownError}
        </em>
      )}
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
  if (!round) return <p className="dim small dnote">{why}</p>
  return (
    <div className="eval">
      <RoundSummary round={round} />
      <Reasons reasons={round.reasons} />
      {/* 회차가 바뀌면 입력을 새로 시작한다 */}
      {round.canEvaluate ? <EvaluateForm key={round.id} submissionId={submission.id} round={round} /> : <p className="dim small dnote">{why}</p>}
      {round.roundNumber > 1 && <PastRounds key={round.id} submissionId={submission.id} currentId={round.id} />}
    </div>
  )
}
