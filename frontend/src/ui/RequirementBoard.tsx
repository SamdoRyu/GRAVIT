// 관리 패널 "요구사항" 탭 (#197 — FR-REQ-04 · 05 · 06 · 07, CONTRACTS.md 「3」 · CONTRACTS_API.md 「8」). 소유: D.
// 문서에 있는 요구사항(active)과 확인이 필요한 요구사항(missing · needs_review — 연결 보존 확인용)을 나눠 보이고, 연결된 이슈를 단다.
// 연결 끊기는 레포 관리자(R2)만. 새 연결은 3D에서 이슈 상자를 요구사항 판 · 대기 칸에 놓아 만든다(C — #15).
import { useMemo, useState } from 'react'
import type { RequirementDto, WorkspaceSnapshot } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import {
  REQUIREMENT_STATUS_HINT,
  REQUIREMENT_STATUS_LABEL,
  canEditRequirementLinks,
  progressRatio,
  progressText,
  requirementName,
  requirementSections,
  type LinkedIssue,
  type RequirementRow,
} from '../data/rules/requirements'
import './requirements.css'

export function RequirementPanel() {
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const sections = useMemo(() => (snapshot ? requirementSections(snapshot) : null), [snapshot])
  if (!snapshot || !sections) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  if (snapshot.requirements.length === 0) return <NoRequirements snapshot={snapshot} />
  const canEdit = canEditRequirementLinks(snapshot.viewer)
  return (
    <div className="req">
      <p className="dim small req-lead">
        {snapshot.settings.specDocumentPath !== null && (
          <>
            명세 문서 <code>{snapshot.settings.specDocumentPath}</code>의 ## 제목마다 요구사항 하나.{' '}
          </>
        )}
        {canEdit ? '이슈 상자를 3D 요구사항 판에 놓으면 연결돼요.' : '연결은 레포 관리자가 3D 요구사항 판에서 바꿔요.'}
      </p>
      <section aria-labelledby="req-active-title" className="req-section">
        <h3 id="req-active-title" className="req-section-title">
          문서에 있는 요구사항 <span className="dim">{sections.active.length}</span>
        </h3>
        {sections.active.length === 0 ? (
          <p className="dim small">문서에 있는 요구사항이 없어요.</p>
        ) : (
          <ul className="req-list" aria-label="문서에 있는 요구사항">
            {sections.active.map((row) => (
              <RequirementItem key={row.requirement.id} row={row} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </section>
      {sections.others.length > 0 && (
        <section aria-labelledby="req-others-title" className="req-section">
          <h3 id="req-others-title" className="req-section-title">
            확인이 필요한 요구사항 <span className="dim">{sections.others.length}</span>
          </h3>
          <ul className="req-list" aria-label="확인이 필요한 요구사항">
            {sections.others.map((row) => (
              <RequirementItem key={row.requirement.id} row={row} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function NoRequirements({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const path = snapshot.settings.specDocumentPath
  return path === null ? (
    <Empty icon="inbox" title="명세 문서 경로가 없어요" hint="레포 관리자가 팀 설정에서 명세 문서 경로를 정하면 ## 제목마다 요구사항이 생겨요." />
  ) : (
    <Empty icon="inbox" title="아직 요구사항이 없어요" hint={`${path}의 ## 제목마다 요구사항이 생겨요. 다음 동기화를 기다려 주세요.`} />
  )
}

function RequirementItem({ row, canEdit }: { row: RequirementRow; canEdit: boolean }) {
  const r = row.requirement
  const name = requirementName(r)
  const active = r.status === 'active'
  return (
    <li className={`req-item${active ? '' : ' is-off'}${active && r.linkedTaskCount === 0 ? ' is-empty' : ''}`} aria-label={name}>
      <div className="req-head">
        {r.sourceKey && <span className="req-key">{r.sourceKey}</span>}
        <strong className="req-title">{r.title}</strong>
        {!active && <span className={`req-status req-status-${r.status}`}>{REQUIREMENT_STATUS_LABEL[r.status]}</span>}
      </div>
      {active ? <Progress requirement={r} /> : <p className="req-hint">{REQUIREMENT_STATUS_HINT[r.status as Exclude<RequirementDto['status'], 'active'>]}</p>}
      {row.issues.length > 0 && (
        <ul className="req-issues" aria-label={`${name}에 연결된 이슈`}>
          {row.issues.map((issue) => (
            <IssueLine key={issue.link.id} issue={issue} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Progress({ requirement }: { requirement: RequirementDto }) {
  const pct = Math.round(progressRatio(requirement) * 100)
  const done = requirement.linkedTaskCount > 0 && requirement.doneTaskCount === requirement.linkedTaskCount
  return (
    <div className="req-progress">
      <span className={`req-bar${done ? ' is-done' : ''}`} aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className={`small${requirement.linkedTaskCount === 0 ? ' req-empty' : ' dim'}`}>{progressText(requirement)}</span>
    </div>
  )
}

/** 연결된 이슈 한 줄 — 누르면 이슈 상세. R2면 연결 끊기(한 번 더 확인) */
function IssueLine({ issue, canEdit }: { issue: LinkedIssue; canEdit: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const task = issue.task
  const label = task ? `#${task.githubIssueNumber} ${task.title}` : '찾을 수 없는 이슈'

  const unlink = async () => {
    setBusy(true)
    const ok = await useOffice.getState().unlinkRequirement(issue.link.id)
    setBusy(false)
    if (ok) useOffice.getState().toast('good', '연결을 끊었어요')
    else setConfirming(false)
  }

  return (
    <li className="req-issue">
      {task ? (
        <button type="button" className="req-issue-open" onClick={() => useOffice.getState().selectInOffice({ kind: 'task', id: task.id })} title="이슈 상세 열기">
          <span className="req-issue-name">{label}</span>
          {task.state === 'closed' && <span className="req-closed">닫힘</span>}
        </button>
      ) : (
        <span className="req-issue-name dim">{label}</span>
      )}
      {canEdit &&
        (confirming ? (
          <span className="req-confirm" role="group" aria-label={`${label} 연결 끊기 확인`}>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => void unlink()}>
              끊기
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
              취소
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost req-unlink" aria-label={`${label} 연결 끊기`} onClick={() => setConfirming(true)}>
            연결 끊기
          </button>
        ))}
    </li>
  )
}
