// 관리 패널 "회고" 탭의 "기술 결정 카드" (#218 — FR-REP-07 · 10 · 11, CONTRACTS_API.md 「15」 decision-cards). 소유: A (리뷰 D).
// 개인 API라 Snapshot · SSE에 없다 — 열 때 읽고, 쓴 뒤에는 응답으로 바꾼다. 학생은 본인 카드만 만들고 고치고 꼬리질문을 요청한다.
// 강사는 고른 팀원의 카드를 읽고, 꼬리질문을 요청한 카드에만 꼬리질문을 쓴다(AI 없음). 권한은 서버가 다시 검사한다. 평가자는 없다.
// 「확인함」 단계는 없다(#335) — 저장만 하고, 「내가 배운 점」이 있는 카드는 회고 리포트를 만들 때 고를 수 있다.
import { useEffect, useState, type FormEvent } from 'react'
import {
  CARD_CELL_MAX,
  CARD_CELLS,
  CARD_MSG,
  FOLLOW_UP_QUESTION_MAX,
  cardUpdateError,
  followUpQuestionError,
} from '../data/rules/decisionCard'
import { isSelectableForReport } from '../data/rules/report'
import type { DecisionCardCells, DecisionCardDto, Id, SubmissionDto } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { relativeTime } from './format'
import { TextField } from './HelpBoard'
import { useNow } from './hooks'
import { Icon } from './icons'

/** 읽은 결과를 무엇을 읽었는지(key)와 함께 둔다 — 대상이 바뀌면 이전 결과는 버려진다. value null = 읽기 실패 */
interface Loaded<T> {
  key: string
  value: T | null
}

const prLabel = (pr: Pick<SubmissionDto, 'githubPrNumber' | 'title'> | undefined) => (pr ? `#${pr.githubPrNumber} ${pr.title}` : 'PR')
const isFinished = (pr: SubmissionDto) => pr.state === 'merged' || pr.state === 'closed'

export function DecisionCardsView({ memberId, canWrite, instructor }: { memberId: Id; canWrite: boolean; instructor: boolean }) {
  const submissions = useOffice((s) => s.office?.snapshot?.submissions ?? null)
  const [reload, setReload] = useState(0)
  const key = `${memberId}|${reload}`
  const [loaded, setLoaded] = useState<Loaded<DecisionCardDto[]> | null>(null)
  const [openId, setOpenId] = useState<Id | null>(null)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadDecisionCards(memberId)
      .then((value) => {
        if (alive) setLoaded({ key, value })
      })
    return () => {
      alive = false
    }
  }, [memberId, key])

  const current = loaded?.key === key ? loaded : null
  if (current === null || submissions === null) return <p className="dim small dnote">불러오는 중…</p>
  const cards = current.value
  if (cards === null) {
    return <Empty icon="alert" title="기술 결정 카드를 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
  }
  const prById = new Map(submissions.map((pr) => [pr.id, pr]))
  // 응답으로 받은 카드 하나를 목록에 바꿔 넣는다(새 카드는 맨 앞 — createdAt 내림차순)
  const put = (card: DecisionCardDto) => setLoaded({ key, value: cards.some((c) => c.id === card.id) ? cards.map((c) => (c.id === card.id ? card : c)) : [card, ...cards] })

  const open = openId ? cards.find((c) => c.id === openId) : undefined
  if (open) {
    return <CardDetail key={open.id} memberId={memberId} card={open} pr={prById.get(open.submissionId)} canWrite={canWrite} instructor={instructor} onSaved={put} onBack={() => setOpenId(null)} />
  }

  // 만들 수 있는 PR — 머지되거나 닫힌 내 PR 중 아직 카드가 없는 것
  const candidates = canWrite ? submissions.filter((pr) => pr.authorMemberId === memberId && isFinished(pr) && !cards.some((c) => c.submissionId === pr.id)) : []
  return (
    <>
      {canWrite && <CreateCard memberId={memberId} candidates={candidates} onCreated={(card) => (put(card), setOpenId(card.id))} />}
      {cards.length === 0 ? (
        <Empty
          icon="inbox"
          title="아직 기술 결정 카드가 없어요"
          hint={canWrite ? '머지되거나 닫힌 내 PR로 카드를 만들면 받은 평가 · 회의 결정 같은 재료가 칸에 채워져요.' : '학생이 카드를 만들면 여기에 보여요.'}
        />
      ) : (
        <ul className="help-list" aria-label="기술 결정 카드 목록">
          {cards.map((card) => (
            <li key={card.id}>
              <button type="button" className="help-item" aria-label={`기술 결정 카드: ${prLabel(prById.get(card.submissionId))}`} onClick={() => setOpenId(card.id)}>
                <span className="help-chips">
                  <ReportReadyChip card={card} />
                  {card.followUpRequested && <span className="help-tag">꼬리질문 요청</span>}
                  {card.followUpQuestions.length > 0 && <span className="help-tag">꼬리질문 {card.followUpQuestions.length}</span>}
                </span>
                <span className="help-item-foot">
                  <strong>{prLabel(prById.get(card.submissionId))}</strong>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** 리포트에 넣을 수 있는가 — 「내가 배운 점」이 있으면 고를 수 있다 (P11 · #335) */
function ReportReadyChip({ card }: { card: DecisionCardDto }) {
  const ready = isSelectableForReport(card)
  return <span className={`help-status${ready ? ' help-status-resolved' : ''}`}>{ready ? '리포트에 넣을 수 있음' : '배운 점 비어 있음'}</span>
}

function CreateCard({ memberId, candidates, onCreated }: { memberId: Id; candidates: SubmissionDto[]; onCreated: (card: DecisionCardDto) => void }) {
  const [picked, setPicked] = useState<Id>('')
  const [busy, setBusy] = useState(false)
  const submissionId = candidates.some((pr) => pr.id === picked) ? picked : (candidates[0]?.id ?? '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!submissionId || busy) return
    setBusy(true)
    const card = await useOffice.getState().createDecisionCard(memberId, { submissionId })
    setBusy(false)
    if (!card) return
    useOffice.getState().toast('good', '기술 결정 카드를 만들었어요 — 재료가 있는 칸이 채워졌어요')
    onCreated(card)
  }

  if (candidates.length === 0) return <p className="dim small dnote">카드를 만들 수 있는 PR이 없어요 — 머지되거나 닫힌 내 PR마다 한 장씩 만들 수 있어요.</p>
  return (
    <form className="retro-bar" onSubmit={submit} noValidate aria-label="기술 결정 카드 만들기">
      <label className="fld grow">
        <span className="fld-label">카드를 만들 PR</span>
        <select className="select" value={submissionId} onChange={(e) => setPicked(e.target.value)}>
          {candidates.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {prLabel(pr)} · {pr.state === 'merged' ? '머지됨' : '닫힘'}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
        카드 만들기
      </button>
    </form>
  )
}

function CardDetail(props: {
  memberId: Id
  card: DecisionCardDto
  pr: SubmissionDto | undefined
  canWrite: boolean
  instructor: boolean
  onSaved: (card: DecisionCardDto) => void
  onBack: () => void
}) {
  const { memberId, card, pr, canWrite, instructor, onSaved, onBack } = props
  const now = useNow(60_000)
  const [asking, setAsking] = useState(false)

  const requestFollowUp = async () => {
    setAsking(true)
    const saved = await useOffice.getState().requestFollowUp(memberId, card.id)
    setAsking(false)
    if (!saved) return
    useOffice.getState().toast('good', '강사에게 꼬리질문을 요청했어요')
    onSaved(saved)
  }

  return (
    <article className="retro-report" aria-label={`기술 결정 카드: ${prLabel(pr)}`}>
      <button type="button" className="btn btn-sm btn-ghost help-back" onClick={onBack}>
        <Icon name="chevronLeft" size={14} />
        카드 목록
      </button>
      <header className="help-head">
        <h3 className="retro-heading">{prLabel(pr)}</h3>
        <span className="help-item-foot">
          <ReportReadyChip card={card} />
          <span className="dim" title={card.updatedAt}>
            · {relativeTime(card.updatedAt, now)} 고침
          </span>
          {pr?.htmlUrl && (
            <>
              <span className="grow" />
              <a className="btn btn-sm btn-ghost" href={pr.htmlUrl} target="_blank" rel="noreferrer">
                GitHub에서 PR 보기
              </a>
            </>
          )}
        </span>
      </header>

      {canWrite ? (
        <CardForm memberId={memberId} card={card} onSaved={onSaved} />
      ) : (
        <dl className="retro-cells" aria-label="카드 9칸">
          {CARD_CELLS.map(({ key, label }) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{card.cells[key]?.trim() ? card.cells[key] : <span className="dim">비어 있어요</span>}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="retro-section" aria-label="강사 꼬리질문">
        <h4 className="help-sub">강사 꼬리질문 {card.followUpQuestions.length}</h4>
        {card.followUpRequested ? (
          <p className="dim small dnote">
            강사에게 꼬리질문을 요청했어요{card.followUpRequestedAt ? ` · ${relativeTime(card.followUpRequestedAt, now)}` : ''}
          </p>
        ) : canWrite ? (
          <div className="help-actions">
            <button type="button" className="btn btn-sm" disabled={asking} onClick={() => void requestFollowUp()}>
              강사 꼬리질문 요청
            </button>
          </div>
        ) : (
          <p className="dim small dnote">학생이 꼬리질문을 요청하면 쓸 수 있어요.</p>
        )}
        {card.followUpQuestions.length > 0 && (
          <ul className="help-comments" aria-label="꼬리질문">
            {card.followUpQuestions.map((q) => (
              <li key={q.id} className="help-comment is-instructor">
                <span className="help-item-foot">
                  <strong>{q.instructor.displayName}</strong>
                  <span className="help-tag">강사</span>
                  <span className="dim">· {relativeTime(q.createdAt, now)}</span>
                </span>
                <p className="help-comment-text">{q.body}</p>
              </li>
            ))}
          </ul>
        )}
        {instructor && card.followUpRequested && <QuestionForm memberId={memberId} card={card} onAdded={onSaved} />}
      </section>
    </article>
  )
}

/** 빈 칸은 null로 보낸다(재료 없음과 같다) */
const toCells = (draft: Record<keyof DecisionCardCells, string>): DecisionCardCells =>
  Object.fromEntries(CARD_CELLS.map(({ key }) => [key, draft[key].trim() === '' ? null : draft[key]])) as unknown as DecisionCardCells

function CardForm({ memberId, card, onSaved }: { memberId: Id; card: DecisionCardDto; onSaved: (card: DecisionCardDto) => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(CARD_CELLS.map(({ key }) => [key, card.cells[key] ?? ''])) as Record<keyof DecisionCardCells, string>)
  const [busy, setBusy] = useState(false)
  const request = { cells: toCells(draft) }
  const error = cardUpdateError(request)
  const over = (key: keyof DecisionCardCells) => Array.from(draft[key]).length > CARD_CELL_MAX

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (error || busy) return
    setBusy(true)
    const saved = await useOffice.getState().updateDecisionCard(memberId, card.id, request)
    setBusy(false)
    if (!saved) return
    useOffice.getState().toast('good', isSelectableForReport(saved) ? '카드를 저장했어요 — 회고 리포트를 만들 때 고를 수 있어요' : '카드를 저장했어요 — 내가 배운 점을 쓰면 리포트에 넣을 수 있어요')
    onSaved(saved)
  }

  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="카드 고치기">
      {CARD_CELLS.map(({ key, label }) => (
        <TextField
          key={key}
          label={label}
          value={draft[key]}
          max={CARD_CELL_MAX}
          rows={key === 'learning' ? 4 : 3}
          error={over(key) ? CARD_MSG.cells : null}
          placeholder={key === 'learning' ? '이 결정에서 배운 점 — 써야 회고 리포트에 넣을 수 있어요' : '재료가 없으면 비어 있어요. 직접 고칠 수 있어요'}
          onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
        />
      ))}
      {error && error !== CARD_MSG.cells && (
        <em className="fld-error" role="alert">
          {error}
        </em>
      )}
      <div className="help-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !!error}>
          저장
        </button>
      </div>
    </form>
  )
}

function QuestionForm({ memberId, card, onAdded }: { memberId: Id; card: DecisionCardDto; onAdded: (card: DecisionCardDto) => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const error = followUpQuestionError({ body })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (error || busy) return
    setBusy(true)
    const question = await useOffice.getState().addFollowUpQuestion(memberId, card.id, { body: body.trim() })
    setBusy(false)
    if (!question) return
    useOffice.getState().toast('good', '꼬리질문을 남겼어요')
    setBody('')
    setTried(false)
    // 꼬리질문은 9칸과 따로 붙는다 — 카드의 수정 시각은 그대로
    onAdded({ ...card, followUpQuestions: [...card.followUpQuestions, question] })
  }

  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="꼬리질문 쓰기">
      <TextField label="꼬리질문" value={body} max={FOLLOW_UP_QUESTION_MAX} rows={3} error={tried ? error : null} placeholder="학생이 더 생각해 볼 질문을 남겨 주세요" onChange={setBody} />
      <div className="help-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          꼬리질문 남기기
        </button>
      </div>
    </form>
  )
}
