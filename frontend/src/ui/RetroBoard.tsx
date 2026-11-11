// 관리 패널 "회고" 탭 (#209 — FR-LRN-08 · FR-REP-01 · 02 · 03 · 05 · 06, CONTRACTS_API.md 「15」). 소유: B (A 요청 — 리뷰 D). 기술 결정 카드 보기는 DecisionCards.tsx (#218, A).
// 개인 API라 Snapshot · SSE에 없다 — 탭을 열 때 읽고, 쓴 뒤에는 응답으로 바꾼다. 학생은 본인 것만 본다(다른 팀원을 고르는 UI 없음).
// 강사는 팀원을 골라 읽기만 한다(만들기 · 느낀 점 쓰기 없음). 권한은 서버가 다시 검사한다(403). 평가자 · 사람별 합계 · 순위는 없다.
// 보기 순서는 기록 → 카드 → 리포트(#336). 리포트는 만들 때 제목 · 느낀 점 · 넣을 기술 결정 카드(PR 단위)를 고른다(#335).
// 저장 버튼은 없다 — 「마크다운 내보내기」가 리포트를 저장(새 리포트는 만들기, 저장된 리포트는 고친 느낀 점)한 뒤 내려받는다(#342).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { CARD_CELLS } from '../data/rules/decisionCard'
import { panelProblem, type PanelProblem } from '../data/rules/errors'
import { kstToday } from '../data/rules/period'
import {
  ACTIVITY_KIND_LABEL,
  REPORT_LEARNING_MAX,
  REPORT_MSG,
  REPORT_TITLE_MAX,
  TIMELINE_KIND_LABEL,
  TIMELINE_PAGE_SIZE,
  defaultReportTitle,
  isSelectableForReport,
  reportCreateError,
  reportFileName,
  reportLearningError,
} from '../data/rules/report'
import type { DecisionCardDto, Id, MemberDto, PageResponse, RetroReportDto, RetroReportSummary, SubmissionDto, TimelineEntry } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { DecisionCardsView } from './DecisionCards'
import { PanelEmpty, PanelState } from './ErrorStates'
import { formatDate, relativeTime } from './format'
import { TextField } from './HelpBoard'
import { useNow } from './hooks'
import { Icon } from './icons'
import { PR_DECISION_LABEL } from './meetingView'
import { useUi } from './uiState'
import './help.css'
import './retro.css'

/** 읽은 결과를 무엇을 읽었는지(key)와 함께 둔다 — 대상이 바뀌면 이전 결과는 그 자리에서 버려진다. value null = 읽기 실패 */
interface Loaded<T> {
  key: string
  value: T | null
}

/** 만든 날(한국 시간) — "11월 5일 (목)" */
const createdDay = (at: string) => formatDate(kstToday(new Date(at)))

export function RetroPanel() {
  const members = useOffice((s) => s.office?.snapshot?.members ?? null)
  const viewer = useOffice((s) => s.office?.snapshot?.viewer ?? null)
  // 보기와 강사가 고른 팀원은 uiState에 둔다 — 강사 요청함(#224)이 카드 주인 · 기술 결정 카드 보기로 연다.
  // 다른 사무실에서 고른 팀원이면 고르기 전으로 본다
  const view = useUi((s) => s.retroView)
  const setView = useUi((s) => s.setRetroView)
  const retroMemberId = useUi((s) => s.retroMemberId)

  if (!members || !viewer) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  const instructor = viewer.role === 'instructor'
  const picked = retroMemberId !== null && members.some((m) => m.id === retroMemberId) ? retroMemberId : null
  const memberId = instructor ? picked : viewer.memberId

  return (
    <div className="help retro">
      {instructor && <MemberPicker members={members} value={picked} onChange={(id) => useUi.getState().openRetroMember(id)} />}
      <div className="retro-switch" role="group" aria-label="회고 보기">
        <button type="button" className={`btn btn-sm${view === 'timeline' ? ' is-on' : ' btn-ghost'}`} aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
          학습 타임라인
        </button>
        <button type="button" className={`btn btn-sm${view === 'cards' ? ' is-on' : ' btn-ghost'}`} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
          기술 결정 카드
        </button>
        <button type="button" className={`btn btn-sm${view === 'reports' ? ' is-on' : ' btn-ghost'}`} aria-pressed={view === 'reports'} onClick={() => setView('reports')}>
          회고 리포트
        </button>
      </div>
      {memberId === null ? (
        instructor ? (
          <Empty icon="users" title="팀원을 골라 주세요" hint="이 사무실 팀원의 학습 타임라인 · 기술 결정 카드 · 회고 리포트를 읽을 수 있어요." />
        ) : (
          <Empty icon="user" title="이 사무실의 팀원만 볼 수 있어요" />
        )
      ) : view === 'timeline' ? (
        <TimelineView key={memberId} memberId={memberId} />
      ) : view === 'reports' ? (
        <ReportsView key={memberId} memberId={memberId} canWrite={!instructor} />
      ) : (
        <DecisionCardsView key={memberId} memberId={memberId} canWrite={!instructor} instructor={instructor} />
      )}
    </div>
  )
}

/** 강사만 — 팀원(빠진 팀원 포함) 중 한 명을 고른다 */
function MemberPicker({ members, value, onChange }: { members: MemberDto[]; value: Id | null; onChange: (id: Id | null) => void }) {
  const sorted = [...members].sort((a, b) => Number(a.removedAt !== null) - Number(b.removedAt !== null))
  return (
    <label className="fld">
      <span className="fld-label">팀원</span>
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">팀원을 골라 주세요</option>
        {sorted.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
            {m.removedAt !== null ? ' (빠진 팀원)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

// ---- 학습 타임라인 ---------------------------------------------------------------

function TimelineView({ memberId }: { memberId: Id }) {
  const now = useNow(60_000)
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  const key = `${memberId}|${page}|${reload}`
  const [loaded, setLoaded] = useState<Loaded<PageResponse<TimelineEntry>> | null>(null)
  // 읽기 실패의 원인 — 권한 오류(다시 불러와도 같음) ↔ 조회 실패(다시 불러오기)를 패널 안에서 나눈다 (#274 — D 공용)
  const [problem, setProblem] = useState<{ key: string; value: PanelProblem } | null>(null)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadTimeline(memberId, page, TIMELINE_PAGE_SIZE, (e) => {
        if (alive) setProblem({ key, value: panelProblem('timeline', e) })
      })
      .then((value) => {
        if (alive) setLoaded({ key, value })
      })
    return () => {
      alive = false
    }
  }, [memberId, page, key])

  const current = loaded?.key === key ? loaded : null
  if (current === null) return <p className="dim small dnote">불러오는 중…</p>
  if (current.value === null) {
    const p = problem?.key === key ? problem.value : null
    // 세션 만료는 "다시 로그인해 주세요" 전체 화면이 대신한다
    return p?.kind === 'state' ? <PanelState problem={p} onRetry={() => setReload((n) => n + 1)} /> : null
  }
  const { items, totalItems, totalPages } = current.value
  if (totalItems === 0) return <PanelEmpty icon="history" title="아직 학습 타임라인이 비어 있어요" body="PR 평가를 받거나 남기고, 회의 안건을 올리면 여기에 차례대로 쌓여요." />

  return (
    <>
      <div className="retro-bar">
        <span className="dim small">모두 {totalItems}개 · 최근 것부터</span>
        <span className="grow" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReload((n) => n + 1)}>
          <Icon name="refresh" size={13} />
          새로 읽기
        </button>
      </div>
      <ul className="help-comments" aria-label="학습 타임라인">
        {items.map((entry, i) => (
          <TimelineItem key={`${page}:${i}`} entry={entry} now={now} />
        ))}
      </ul>
      {totalPages > 1 && (
        <nav className="retro-pages" aria-label="타임라인 페이지">
          <button type="button" className="btn btn-icon btn-ghost" aria-label="이전 페이지" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="small">
            {page + 1} / {totalPages}
          </span>
          <button type="button" className="btn btn-icon btn-ghost" aria-label="다음 페이지" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
            <Icon name="chevronRight" size={16} />
          </button>
        </nav>
      )}
    </>
  )
}

function TimelineItem({ entry, now }: { entry: TimelineEntry; now: number }) {
  const label = TIMELINE_KIND_LABEL[entry.kind]
  return (
    <li className={`help-comment${entry.kind === 'instructor_feedback' ? ' is-instructor' : ''}`} aria-label={`${label}: ${entry.title}`}>
      <span className="help-item-foot">
        <span className="help-tag">{label}</span>
        {entry.verdict && <span className={`help-status ${entry.verdict === 'recommend' ? 'help-status-resolved' : 'help-status-discussing'}`}>{entry.verdict === 'recommend' ? '추천' : '비추천'}</span>}
        <span className="grow" />
        <span className="dim" title={entry.occurredAt}>
          {relativeTime(entry.occurredAt, now)}
        </span>
      </span>
      <strong className="retro-title">{entry.title}</strong>
      {entry.detail && <p className="help-comment-text">{entry.detail}</p>}
    </li>
  )
}

// ---- 회고 리포트 ---------------------------------------------------------------

function ReportsView({ memberId, canWrite }: { memberId: Id; canWrite: boolean }) {
  const [openId, setOpenId] = useState<Id | null>(null)
  return openId ? (
    <ReportDetail key={openId} memberId={memberId} reportId={openId} canWrite={canWrite} onBack={() => setOpenId(null)} />
  ) : (
    <ReportList memberId={memberId} canWrite={canWrite} onOpen={setOpenId} />
  )
}

function ReportList({ memberId, canWrite, onOpen }: { memberId: Id; canWrite: boolean; onOpen: (id: Id) => void }) {
  const [reload, setReload] = useState(0)
  const [creating, setCreating] = useState(false)
  const key = `${memberId}|${reload}`
  const [loaded, setLoaded] = useState<Loaded<RetroReportSummary[]> | null>(null)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadReports(memberId)
      .then((value) => {
        if (alive) setLoaded({ key, value })
      })
    return () => {
      alive = false
    }
  }, [memberId, key])

  if (creating) {
    // 내보내기로 저장했으면 목록으로 돌아가 새 리포트를 보인다
    const close = (saved: boolean) => {
      setCreating(false)
      if (saved) setReload((n) => n + 1)
    }
    return <CreateReportForm memberId={memberId} onDone={() => close(true)} onCancel={() => close(false)} />
  }
  const current = loaded?.key === key ? loaded : null
  return (
    <>
      {canWrite && (
        <div className="retro-bar">
          <span className="small">넣을 기술 결정 카드를 고르고 느낀 점을 써요</span>
          <span className="grow" />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
            리포트 만들기
          </button>
        </div>
      )}
      {current === null ? (
        <p className="dim small dnote">불러오는 중…</p>
      ) : current.value === null ? (
        <Empty icon="alert" title="회고 리포트를 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
      ) : current.value.length === 0 ? (
        <Empty icon="inbox" title="아직 회고 리포트가 없어요" hint={canWrite ? '리포트를 만들면 느낀 점과 고른 기술 결정 카드가 한 곳에 정리돼요.' : '학생이 리포트를 만들면 여기에 보여요.'} />
      ) : (
        <ul className="help-list" aria-label="회고 리포트 목록">
          {current.value.map((r) => (
            <li key={r.id}>
              <button type="button" className="help-item" aria-label={`${r.title} · ${createdDay(r.createdAt)}`} onClick={() => onOpen(r.id)}>
                <span className="help-item-foot">
                  <strong className="retro-title">{r.title}</strong>
                  <span className="grow" />
                  <span className="dim" title={r.createdAt}>
                    {createdDay(r.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const prLabel = (pr: Pick<SubmissionDto, 'githubPrNumber' | 'title'> | undefined) => (pr ? `#${pr.githubPrNumber} ${pr.title}` : 'PR')

/**
 * 리포트 만들기(#335 · #342) — 두 단계. 1단계: 제목(기본값 "회고 리포트 · M월 D일") · 넣을 기술 결정 카드(PR 번호 순). 「내가 배운 점」이
 * 빈 카드는 고를 수 없다(P11). 2단계: 느낀 점(필수) — 「마크다운 내보내기」가 리포트를 만들고(목록에 저장) 마크다운을 내려받는다.
 * 화면은 늘 최종(final)을 만든다 — 중간 리포트는 보류(FR-REP-05).
 */
function CreateReportForm({ memberId, onDone, onCancel }: { memberId: Id; onDone: () => void; onCancel: () => void }) {
  const submissions = useOffice((s) => s.office?.snapshot?.submissions ?? null)
  const [step, setStep] = useState<'pick' | 'write'>('pick')
  const [title, setTitle] = useState(() => defaultReportTitle(new Date()))
  const [learning, setLearning] = useState('')
  const [picked, setPicked] = useState<Id[]>([])
  const [cards, setCards] = useState<DecisionCardDto[] | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadDecisionCards(memberId)
      .then((value) => {
        if (alive) setCards(value)
      })
    return () => {
      alive = false
    }
  }, [memberId])

  const prById = new Map((submissions ?? []).map((pr) => [pr.id, pr]))
  const prNumber = (card: DecisionCardDto) => prById.get(card.submissionId)?.githubPrNumber ?? Number.MAX_SAFE_INTEGER
  const sorted = [...(cards ?? [])].sort((a, b) => prNumber(a) - prNumber(b))
  const request = { kind: 'final' as const, title, learning, decisionCardIds: picked }
  const error = reportCreateError(request)
  // 1단계는 느낀 점을 아직 받지 않는다 — 느낀 점 오류만 남았으면 다음 단계로 간다
  const pickError = error === REPORT_MSG.learning ? null : error
  const toggle = (id: Id, on: boolean) => setPicked((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)))
  const pickedLabels = sorted.filter((card) => picked.includes(card.id)).map((card) => prLabel(prById.get(card.submissionId)))

  const next = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (pickError) return
    setTried(false)
    setStep('write')
  }

  // 만들기(목록에 저장) → 마크다운 받기 → 내려받기. 저장만 되고 받기가 실패하면 저장된 사실을 따로 알린다(받기 실패 알림은 store가 띄운다)
  const exportReport = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (error || busy) return
    setBusy(true)
    const { createReport, exportReportMarkdown, toast } = useOffice.getState()
    const created = await createReport(memberId, { ...request, title: title.trim() })
    if (!created) {
      setBusy(false)
      return
    }
    const markdown = await exportReportMarkdown(memberId, created.id)
    setBusy(false)
    if (markdown === null) {
      toast('warn', `"${created.title}" 리포트는 목록에 저장했어요 — 리포트를 열어 다시 내보내 주세요`)
    } else {
      saveTextFile(reportFileName(created), markdown)
      toast('good', `"${created.title}" 리포트를 목록에 저장하고 마크다운 파일로 내보냈어요 — 팀원 이름은 "팀원 A"처럼 바뀌었어요`)
    }
    onDone()
  }

  if (step === 'write') {
    return (
      <form key="write" className="help-form" onSubmit={exportReport} noValidate aria-label="회고 리포트 만들기">
        <p className="dim small" aria-label="고른 내용">
          {title.trim()} · 넣을 기술 결정 카드 {pickedLabels.length === 0 ? '없음' : pickedLabels.join(', ')}
        </p>
        <TextField label="느낀 점" value={learning} max={REPORT_LEARNING_MAX} rows={5} autoFocus error={tried && error === REPORT_MSG.learning ? error : null} placeholder="이번 기간을 돌아보며 느낀 점을 적어 주세요" onChange={setLearning} />
        <p className="dim small">「마크다운 내보내기」를 누르면 리포트 목록에 저장되고 마크다운 파일도 받아요</p>
        <div className="help-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep('pick')} disabled={busy}>
            이전
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
            마크다운 내보내기
          </button>
        </div>
      </form>
    )
  }

  return (
    <form key="pick" className="help-form" onSubmit={next} noValidate aria-label="회고 리포트 만들기">
      <TextField label="제목" value={title} max={REPORT_TITLE_MAX} error={tried && pickError === REPORT_MSG.title ? pickError : null} placeholder="예: 1차 스프린트 회고" onChange={setTitle} />
      <fieldset className="retro-pick">
        <legend className="fld-label">넣을 기술 결정 카드</legend>
        {cards === undefined || submissions === null ? (
          <p className="dim small">불러오는 중…</p>
        ) : cards === null ? (
          <p className="dim small">기술 결정 카드를 불러오지 못했어요</p>
        ) : sorted.length === 0 ? (
          <p className="dim small">아직 기술 결정 카드가 없어요 — 카드 없이도 만들 수 있어요</p>
        ) : (
          <ul className="retro-pick-list" aria-label="넣을 기술 결정 카드">
            {sorted.map((card) => {
              const selectable = isSelectableForReport(card)
              return (
                <li key={card.id}>
                  <label className={`retro-check${selectable ? '' : ' is-disabled'}`}>
                    <input type="checkbox" disabled={!selectable} checked={picked.includes(card.id)} onChange={(e) => toggle(card.id, e.target.checked)} />
                    <span>{prLabel(prById.get(card.submissionId))}</span>
                  </label>
                  {!selectable && <span className="dim small retro-pick-hint">배운 점을 쓰면 고를 수 있어요</span>}
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>
      <div className="help-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary">
          다음
        </button>
      </div>
    </form>
  )
}

function ReportDetail({ memberId, reportId, canWrite, onBack }: { memberId: Id; reportId: Id; canWrite: boolean; onBack: () => void }) {
  const [reload, setReload] = useState(0)
  const key = `${memberId}|${reportId}|${reload}`
  const [loaded, setLoaded] = useState<Loaded<RetroReportDto> | null>(null)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadReport(memberId, reportId)
      .then((value) => {
        if (alive) setLoaded({ key, value })
      })
    return () => {
      alive = false
    }
  }, [memberId, reportId, key])

  const back = (
    <button type="button" className="btn btn-sm btn-ghost help-back" onClick={onBack}>
      <Icon name="chevronLeft" size={14} />
      리포트 목록
    </button>
  )
  const current = loaded?.key === key ? loaded : null
  if (current === null) {
    return (
      <>
        {back}
        <p className="dim small dnote">불러오는 중…</p>
      </>
    )
  }
  const report = current.value
  if (report === null) {
    return (
      <>
        {back}
        <Empty icon="alert" title="회고 리포트를 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
      </>
    )
  }
  return <ReportArticle key={report.id} memberId={memberId} report={report} canWrite={canWrite} back={back} onSaved={(saved) => setLoaded({ key, value: saved })} />
}

/**
 * 리포트 상세 — 본인은 느낀 점을 고칠 수 있다. 저장 버튼은 없고, 「마크다운 내보내기」가 바뀐 느낀 점을 먼저 저장한 뒤 내려받는다
 * (#342). 안 바뀌었으면 내려받기만 한다. 강사는 읽기 · 내보내기만.
 */
function ReportArticle({ memberId, report, canWrite, back, onSaved }: { memberId: Id; report: RetroReportDto; canWrite: boolean; back: ReactNode; onSaved: (saved: RetroReportDto) => void }) {
  const now = useNow(60_000)
  const [learning, setLearning] = useState(report.learning ?? '')
  const [exporting, setExporting] = useState(false)
  const dirty = canWrite && learning !== (report.learning ?? '')
  const learningError = dirty ? reportLearningError({ learning }) : null

  const exportMarkdown = async () => {
    if (exporting || learningError) return
    setExporting(true)
    const { updateReportLearning, exportReportMarkdown, toast } = useOffice.getState()
    let saved: RetroReportDto | null = null
    if (dirty) {
      saved = await updateReportLearning(memberId, report.id, { learning })
      if (!saved) {
        setExporting(false)
        return
      }
      setLearning(saved.learning ?? '')
      onSaved(saved)
    }
    const markdown = await exportReportMarkdown(memberId, report.id)
    setExporting(false)
    if (markdown === null) {
      if (saved) toast('warn', '느낀 점은 저장했어요 — 마크다운은 다시 내보내 주세요')
      return
    }
    saveTextFile(reportFileName(saved ?? report), markdown)
    toast('good', `${saved ? '느낀 점을 저장하고 ' : ''}마크다운 파일로 내보냈어요 — 팀원 이름은 "팀원 A"처럼 바뀌었어요`)
  }

  return (
    <article className="retro-report" aria-label={`회고 리포트: ${report.title}`}>
      {back}
      <header className="help-head">
        <h3 className="retro-heading">{report.title}</h3>
        <p className="dim small retro-areas" aria-label="담당 기능 영역">
          {report.areaLabels.length === 0 ? '담당 기능 영역 없음 — 고른 카드에 area 라벨이 없어요' : report.areaLabels.map((label) => label.slice('area:'.length)).join(' · ')}
        </p>
        <span className="help-item-foot">
          <span className="dim" title={report.createdAt}>
            {createdDay(report.createdAt)} 만듦
          </span>
          <span className="grow" />
          <button type="button" className="btn btn-sm" disabled={exporting || !!learningError} onClick={() => void exportMarkdown()}>
            마크다운 내보내기
          </button>
        </span>
      </header>

      <Section title="느낀 점">
        {canWrite ? (
          <div className="help-form">
            <TextField label="느낀 점" value={learning} max={REPORT_LEARNING_MAX} rows={5} error={learningError} placeholder="이번 기간을 돌아보며 느낀 점을 적어 주세요" onChange={setLearning} />
            <p className="dim small">「마크다운 내보내기」를 누르면 고친 느낀 점이 저장돼요</p>
          </div>
        ) : (
          <p className="help-content">{report.learning?.trim() ? report.learning : <span className="dim">아직 안 썼어요</span>}</p>
        )}
      </Section>

      <Section title={`안건 결과 ${report.agendaResults.length}`}>
        {report.agendaResults.length === 0 ? (
          <p className="dim small">결론이 난 안건이 아직 없어요</p>
        ) : (
          <ul className="help-comments" aria-label="안건 결과">
            {report.agendaResults.map((r) => (
              <li key={r.agendaItemId} className="help-comment">
                <span className="help-item-foot">
                  <strong className="retro-title">{r.title}</strong>
                  <span className="grow" />
                  {r.prDecision && <span className="help-tag">{PR_DECISION_LABEL[r.prDecision]}</span>}
                </span>
                <p className="help-comment-text">{r.conclusion}</p>
                {r.learning && (
                  <p className="help-note help-note-good">
                    <strong>배운 점</strong> {r.learning}
                  </p>
                )}
                <span className="dim small">{relativeTime(r.decidedAt, now)} 결정</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`강사 피드백 ${report.instructorFeedbacks.length}`}>
        {report.instructorFeedbacks.length === 0 ? (
          <p className="dim small">받은 강사 피드백이 없어요</p>
        ) : (
          <ul className="help-comments" aria-label="강사 피드백">
            {report.instructorFeedbacks.map((f, i) => (
              <li key={`${f.agendaItemId}:${i}`} className="help-comment is-instructor">
                <span className="help-item-foot">
                  <strong>{f.instructor.displayName}</strong>
                  <span className="dim">· {relativeTime(f.createdAt, now)}</span>
                </span>
                <p className="help-comment-text">{f.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {report.activityDistribution.length > 0 && (
        <Section title="활동 분포">
          <ul className="retro-chips" aria-label="활동 분포">
            {report.activityDistribution.map((a) => (
              <li key={a.kind} className="help-tag">
                {ACTIVITY_KIND_LABEL[a.kind]} {a.totalMinutes}분
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`기술 결정 카드 ${report.decisionCards.length}`}>
        {report.decisionCards.length === 0 ? (
          <p className="dim small">이 리포트에 고른 기술 결정 카드가 없어요</p>
        ) : (
          <ul className="help-comments" aria-label="기술 결정 카드">
            {report.decisionCards.map((card) => (
              <DecisionCardItem key={card.id} card={card} />
            ))}
          </ul>
        )}
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="retro-section" aria-label={title}>
      <h4 className="help-sub">{title}</h4>
      {children}
    </section>
  )
}

/** 읽기 전용 — 카드 만들기 · 고치기 · 꼬리질문은 "기술 결정 카드" 보기(DecisionCards.tsx, #218) */
function DecisionCardItem({ card }: { card: DecisionCardDto }) {
  const pr = useOffice((s) => s.office?.snapshot?.submissions.find((x) => x.id === card.submissionId))
  const cells = CARD_CELLS.filter(({ key }) => card.cells[key]?.trim())
  return (
    <li className="help-comment">
      <strong className="retro-title">{prLabel(pr)}</strong>
      <dl className="retro-cells">
        {cells.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{card.cells[key]}</dd>
          </div>
        ))}
      </dl>
      {card.followUpQuestions.map((q) => (
        <p key={q.id} className="help-note">
          <strong>강사 꼬리질문</strong> {q.body}
        </p>
      ))}
    </li>
  )
}

/** 브라우저에서 텍스트 파일 저장 */
function saveTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
