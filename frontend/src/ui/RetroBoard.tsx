// 관리 패널 "회고" 탭 (#209 — FR-LRN-08 · FR-REP-01 · 02 · 03 · 05 · 06, CONTRACTS_API.md 「15」). 소유: B (A 요청 — 리뷰 D).
// 개인 API라 Snapshot · SSE에 없다 — 탭을 열 때 읽고, 쓴 뒤에는 응답으로 바꾼다. 학생은 본인 것만 본다(다른 팀원을 고르는 UI 없음).
// 강사는 팀원을 골라 읽기만 한다(만들기 · 배운 점 쓰기 없음). 권한은 서버가 다시 검사한다(403). 평가자 · 사람별 합계 · 순위는 없다.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { kstToday } from '../data/rules/period'
import {
  ACTIVITY_KIND_LABEL,
  REPORT_KIND_LABEL,
  REPORT_KINDS,
  REPORT_LEARNING_MAX,
  TIMELINE_KIND_LABEL,
  TIMELINE_PAGE_SIZE,
  reportFileName,
  reportLearningError,
  type ReportKind,
} from '../data/rules/report'
import type { DecisionCardDto, Id, MemberDto, PageResponse, RetroReportDto, RetroReportSummary, TimelineEntry } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { formatDate, relativeTime } from './format'
import { TextField } from './HelpBoard'
import { useNow } from './hooks'
import { Icon } from './icons'
import { PR_DECISION_LABEL } from './meetingView'
import './help.css'
import './retro.css'

type View = 'timeline' | 'reports'

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
  const [view, setView] = useState<View>('timeline')
  const [picked, setPicked] = useState<Id | null>(null)

  if (!members || !viewer) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  const instructor = viewer.role === 'instructor'
  const memberId = instructor ? picked : viewer.memberId

  return (
    <div className="help retro">
      {instructor && <MemberPicker members={members} value={picked} onChange={setPicked} />}
      <div className="retro-switch" role="group" aria-label="회고 보기">
        <button type="button" className={`btn btn-sm${view === 'timeline' ? ' is-on' : ' btn-ghost'}`} aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
          학습 타임라인
        </button>
        <button type="button" className={`btn btn-sm${view === 'reports' ? ' is-on' : ' btn-ghost'}`} aria-pressed={view === 'reports'} onClick={() => setView('reports')}>
          회고 리포트
        </button>
      </div>
      {memberId === null ? (
        instructor ? (
          <Empty icon="users" title="팀원을 골라 주세요" hint="이 사무실 팀원의 학습 타임라인과 회고 리포트를 읽을 수 있어요." />
        ) : (
          <Empty icon="user" title="이 사무실의 팀원만 볼 수 있어요" />
        )
      ) : view === 'timeline' ? (
        <TimelineView key={memberId} memberId={memberId} />
      ) : (
        <ReportsView key={memberId} memberId={memberId} canWrite={!instructor} />
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

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadTimeline(memberId, page, TIMELINE_PAGE_SIZE)
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
    return <Empty icon="alert" title="학습 타임라인을 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
  }
  const { items, totalItems, totalPages } = current.value
  if (totalItems === 0) return <Empty icon="history" title="아직 학습 타임라인이 비어 있어요" hint="PR 평가를 받거나 남기고, 회의 안건을 올리면 여기에 쌓여요." />

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
  const [busy, setBusy] = useState(false)
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

  const create = async (kind: ReportKind) => {
    setBusy(true)
    const created = await useOffice.getState().createReport(memberId, { kind })
    setBusy(false)
    if (!created) return
    useOffice.getState().toast('good', `${REPORT_KIND_LABEL[kind]} 회고 리포트를 만들었어요`)
    onOpen(created.id)
  }

  const current = loaded?.key === key ? loaded : null
  return (
    <>
      {canWrite && (
        <div className="retro-bar" role="group" aria-label="회고 리포트 만들기">
          <span className="small">지금 데이터로 리포트를 만들어요</span>
          <span className="grow" />
          {REPORT_KINDS.map((kind) => (
            <button key={kind} type="button" className={`btn btn-sm${kind === 'final' ? ' btn-primary' : ''}`} disabled={busy} onClick={() => void create(kind)}>
              {REPORT_KIND_LABEL[kind]} 리포트 만들기
            </button>
          ))}
        </div>
      )}
      {current === null ? (
        <p className="dim small dnote">불러오는 중…</p>
      ) : current.value === null ? (
        <Empty icon="alert" title="회고 리포트를 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
      ) : current.value.length === 0 ? (
        <Empty icon="inbox" title="아직 회고 리포트가 없어요" hint={canWrite ? '중간 · 최종 리포트를 만들면 지금까지의 기록이 정리돼요.' : '학생이 리포트를 만들면 여기에 보여요.'} />
      ) : (
        <ul className="help-list" aria-label="회고 리포트 목록">
          {current.value.map((r) => (
            <li key={r.id}>
              <button type="button" className="help-item" aria-label={`${REPORT_KIND_LABEL[r.kind]} 회고 리포트 · ${createdDay(r.createdAt)}`} onClick={() => onOpen(r.id)}>
                <span className="help-chips">
                  <span className={`help-status${r.kind === 'final' ? ' help-status-open' : ''}`}>{REPORT_KIND_LABEL[r.kind]}</span>
                </span>
                <span className="help-item-foot">
                  <strong>{REPORT_KIND_LABEL[r.kind]} 회고 리포트</strong>
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

function ReportDetail({ memberId, reportId, canWrite, onBack }: { memberId: Id; reportId: Id; canWrite: boolean; onBack: () => void }) {
  const now = useNow(60_000)
  const [reload, setReload] = useState(0)
  const key = `${memberId}|${reportId}|${reload}`
  const [loaded, setLoaded] = useState<Loaded<RetroReportDto> | null>(null)
  const [exporting, setExporting] = useState(false)

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

  const exportMarkdown = async () => {
    setExporting(true)
    const markdown = await useOffice.getState().exportReportMarkdown(memberId, report.id)
    setExporting(false)
    if (markdown === null) return
    saveTextFile(reportFileName(report), markdown)
    useOffice.getState().toast('good', '마크다운 파일로 내보냈어요 — 팀원 이름은 "팀원 A"처럼 바뀌었어요')
  }

  return (
    <article className="retro-report" aria-label={`${REPORT_KIND_LABEL[report.kind]} 회고 리포트`}>
      {back}
      <header className="help-head">
        <h3 className="retro-heading">{REPORT_KIND_LABEL[report.kind]} 회고 리포트</h3>
        <span className="help-item-foot">
          <span className="dim" title={report.createdAt}>
            {createdDay(report.createdAt)} 만듦
          </span>
          <span className="grow" />
          <button type="button" className="btn btn-sm" disabled={exporting} onClick={() => void exportMarkdown()}>
            마크다운 내보내기
          </button>
        </span>
      </header>

      <Section title="요약">
        <p className="help-content">{report.summary ?? <span className="dim">요약이 없어요</span>}</p>
      </Section>

      <Section title="담당 기능 영역">
        {report.areaLabels.length === 0 ? (
          <p className="dim small">area 라벨이 붙은 이슈 · PR이 아직 없어요</p>
        ) : (
          <ul className="retro-chips" aria-label="담당 기능 영역">
            {report.areaLabels.map((label) => (
              <li key={label} className="help-tag">
                {label.slice('area:'.length)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="내가 배운 점">
        {canWrite ? (
          <LearningForm key={report.learning ?? ''} memberId={memberId} report={report} onSaved={(saved) => setLoaded({ key, value: saved })} />
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

      <Section title={`확인한 기술 결정 카드 ${report.decisionCards.length}`}>
        {report.decisionCards.length === 0 ? (
          <p className="dim small">확인한 기술 결정 카드가 없어요</p>
        ) : (
          <ul className="help-comments" aria-label="확인한 기술 결정 카드">
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

function LearningForm({ memberId, report, onSaved }: { memberId: Id; report: RetroReportDto; onSaved: (saved: RetroReportDto) => void }) {
  const [text, setText] = useState(report.learning ?? '')
  const [busy, setBusy] = useState(false)
  const error = reportLearningError({ learning: text })
  const dirty = text !== (report.learning ?? '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (error || busy || !dirty) return
    setBusy(true)
    const saved = await useOffice.getState().updateReportLearning(memberId, report.id, { learning: text })
    setBusy(false)
    if (!saved) return
    useOffice.getState().toast('good', '내가 배운 점을 저장했어요')
    onSaved(saved)
  }

  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="내가 배운 점 쓰기">
      <TextField label="내가 배운 점" value={text} max={REPORT_LEARNING_MAX} rows={5} error={error} placeholder="이번 프로젝트에서 배운 점을 적어 보세요" onChange={setText} />
      <div className="help-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !!error || !dirty}>
          저장
        </button>
      </div>
    </form>
  )
}

const CARD_CELLS: [keyof DecisionCardDto['cells'], string][] = [
  ['goal', '무엇을 하려 했나'],
  ['initialApproach', '처음 택한 방법'],
  ['feedbackReceived', '받은 평가'],
  ['meetingDecision', '회의에서 정한 것'],
  ['finalChange', '최종적으로 바꾼 것'],
  ['rationale', '왜 그렇게 결정했나'],
  ['blockedMoment', '막혔던 순간'],
  ['learning', '내가 배운 점'],
  ['source', '원본'],
]

/** 읽기 전용 — 카드 만들기 · 고치기 · 꼬리질문 화면은 이 이슈 밖(후속) */
function DecisionCardItem({ card }: { card: DecisionCardDto }) {
  const cells = CARD_CELLS.filter(([k]) => card.cells[k]?.trim())
  return (
    <li className="help-comment">
      <dl className="retro-cells">
        {cells.map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd>{card.cells[k]}</dd>
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
