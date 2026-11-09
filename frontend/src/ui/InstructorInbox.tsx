// 강사 요청함 (#224 — FR-LRN-23, CONTRACTS_API.md 「16」). 소유: B (#224 — 리뷰 D).
// 지금 지정된 사무실들의 도움 요청 · 결정 피드백 · 꼬리질문을 한 목록으로 본다. 사무실 고르기(사무실 밖)와 상단 바 더보기(사무실 안)
// 두 곳에서 같은 목록을 쓴다. 항목을 누르면 그 사무실을 열고 관리 패널의 해당 탭으로 간다 — 답은 각 화면의 원래 API로 쓴다.
// 강사(MeResponse.isInstructor)에게만 보인다. 숨김은 편의이고 서버가 다시 검사한다(403). 저장하지 않는 계산 값이라 열 때마다 읽는다.
import { useEffect, useState } from 'react'
import { panelProblem, type PanelProblem } from '../data/rules/errors'
import { DEFAULT_INBOX_FILTER, INBOX_FILTERS, INBOX_KIND_LABEL, answeredParam, inboxDestination, type InboxFilter } from '../data/rules/inbox'
import type { InboxItem } from '../data/types'
import { useSession } from '../session'
import { useOffice } from '../store'
import { Modal } from './Dialogs'
import { PanelEmpty, PanelState } from './ErrorStates'
import { relativeTime } from './format'
import { useNow } from './hooks'
import { useUi } from './uiState'
import './help.css'
import './inbox.css'

const EMPTY_TEXT: Record<InboxFilter, string> = {
  unanswered: '답할 요청이 없어요.',
  answered: '아직 답한 요청이 없어요.',
  all: '받은 요청이 없어요.',
}

const itemKey = (item: InboxItem) => `${item.kind}:${item.workspaceId}:${item.targetId}`

/** 그 사무실을 열고(이미 열려 있으면 그대로) 관리 패널의 해당 탭 · 대상으로 간다 */
async function openInboxItem(item: InboxItem) {
  if (useOffice.getState().office?.workspaceId !== item.workspaceId) await useSession.getState().enterWorkspace(item.workspaceId)
  const ui = useUi.getState()
  ui.setPanelOpen(true)
  const to = inboxDestination(item)
  if (to.tab === 'help') ui.openHelpRequest(to.helpRequestId)
  else if (to.tab === 'decisions') ui.openDecisionRecord(to.agendaItemId)
  else ui.openRetroMember(to.memberId, to.view)
}

/** 읽은 결과를 무엇을 읽었는지(key)와 함께 둔다 — 고르기가 바뀌면 이전 결과는 버려진다. value null = 읽기 실패 */
interface Loaded {
  key: string
  value: InboxItem[] | null
}

/** 고르기 + 목록. onOpen은 항목을 누른 직후(이동하기 전) — 대화상자가 닫는다 */
export function InboxList({ onOpen }: { onOpen?: () => void }) {
  const now = useNow(60_000)
  const [filter, setFilter] = useState<InboxFilter>(DEFAULT_INBOX_FILTER)
  const [reload, setReload] = useState(0)
  const key = `${filter}|${reload}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  // 읽기 실패의 원인 — 강사 아님(권한) ↔ 조회 실패(다시 불러오기)를 목록 자리에서 나눈다 (#274 — D 공용)
  const [problem, setProblem] = useState<{ key: string; value: PanelProblem } | null>(null)

  useEffect(() => {
    let alive = true
    void useSession
      .getState()
      .loadInstructorInbox(answeredParam(filter), (e) => {
        if (alive) setProblem({ key, value: panelProblem('inbox', e) })
      })
      .then((value) => {
        if (alive) setLoaded({ key, value })
      })
    return () => {
      alive = false
    }
  }, [filter, key])

  const current = loaded?.key === key ? loaded.value : undefined
  const failure = problem?.key === key && problem.value.kind === 'state' ? problem.value : null

  const open = async (item: InboxItem) => {
    setOpening(itemKey(item))
    onOpen?.()
    await openInboxItem(item)
  }

  return (
    <div className="inbox">
      <div className="inbox-switch" role="group" aria-label="요청함 고르기">
        {INBOX_FILTERS.map((f) => (
          <button key={f.id} type="button" className={`btn btn-sm${filter === f.id ? ' is-on' : ' btn-ghost'}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {current === undefined ? (
        <p className="dim small" role="status">
          요청함을 읽는 중…
        </p>
      ) : current === null ? (
        failure && <PanelState problem={failure} onRetry={() => setReload((n) => n + 1)} />
      ) : current.length === 0 ? (
        <PanelEmpty title={EMPTY_TEXT[filter]} body="팀원이 도움 요청 · 결정 기록 · 기술 결정 카드에서 강사에게 요청하면 여기에 모여요." />
      ) : (
        <ul className="help-list" aria-label="강사 요청함 목록">
          {current.map((item) => (
            <li key={itemKey(item)}>
              <button
                type="button"
                className="help-item"
                aria-label={`${INBOX_KIND_LABEL[item.kind]}: ${item.title}`}
                disabled={opening !== null}
                onClick={() => void open(item)}
              >
                <span className="help-chips">
                  <span className="help-tag">{INBOX_KIND_LABEL[item.kind]}</span>
                  {item.answeredAt === null ? <span className="help-status help-status-open">답 전</span> : <span className="help-tag help-tag-good">답함</span>}
                </span>
                <strong className="help-item-text">{item.title}</strong>
                <span className="help-item-foot">
                  <span className="dim inbox-ws">{item.workspaceDisplayName}</span>
                  <span className="grow" />
                  <span className="dim" title={item.requestedAt}>
                    {opening === itemKey(item) ? '여는 중…' : `${relativeTime(item.requestedAt, now)} 요청`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function close() {
  useOffice.getState().openDialog(null)
}

/** 사무실 안 — 상단 바 더보기 "강사 요청함" */
export function InstructorInboxDialog() {
  return (
    <Modal title="강사 요청함" onClose={close} width={520}>
      <div className="modal-body inbox-body">
        <p className="dim small inbox-lead">지금 지정된 사무실의 요청만 보여요. 누르면 그 사무실의 해당 화면으로 가요.</p>
        <InboxList onOpen={close} />
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" data-autofocus onClick={close}>
          닫기
        </button>
      </footer>
    </Modal>
  )
}
