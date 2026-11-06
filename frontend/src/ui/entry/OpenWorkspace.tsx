// 레포를 골라 새 사무실 열기 (#68 조직 · 레포 선택 · #13 명세 문서 경로 · FR-PLAN-01 기간, CONTRACTS_API.md 「3」). 소유: D.
// 사무실은 그 레포의 레포 관리자(R2)만 연다. 참여자에게는 팀장에게 요청하라는 안내, 앱이 없는 조직은 승인 요청 링크.
import { useEffect, useState, type FormEvent } from 'react'
import { addLocalDays, kstToday, openWorkspaceError, periodError, projectDay, specPathValue } from '../../data/rules/period'
import type { OwnerChoice, RepositoryChoice, RepositoryChoiceResponse } from '../../data/types'
import { useSession } from '../../session'
import { Field } from '../common'

/** 처음 보이는 기간 — 오늘부터 2주 */
const DEFAULT_DAYS = 14

function OpenWorkspaceForm({ repo, onCancel }: { repo: RepositoryChoice; onCancel: () => void }) {
  const today = kstToday()
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(addLocalDays(today, DEFAULT_DAYS - 1))
  const [specPath, setSpecPath] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = { githubRepoId: repo.githubRepoId, projectStartDate: start, projectEndDate: end, specDocumentPath: specPathValue(specPath), activityConsent: consent }
  const error = openWorkspaceError(request)
  // 날짜 순서는 바로, 그 밖은 제출할 때 보인다
  const shown = submitted || (start && end && periodError(start, end)) ? error : null
  const days = periodError(start, end) ? null : projectDay(request, start)?.totalDays
  const id = `open-${repo.githubRepoId}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error || busy) return
    setBusy(true)
    setServerError(null)
    const failed = await useSession.getState().openNewWorkspace(request)
    setBusy(false)
    setServerError(failed)
  }

  return (
    <form className="entry-open" onSubmit={submit} noValidate aria-label={`${repo.owner}/${repo.name} 사무실 열기`}>
      <div className="grid2">
        <Field label="시작 날짜">
          <input className="select" type="date" value={start} required onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="끝 날짜">
          <input className="select" type="date" value={end} min={start || undefined} required onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <p className="dim small">{days ? `총 ${days}일 · ` : ''}상단 바 D-day가 끝 날짜까지 세요. 레포 관리자는 나중에 바꿀 수 있어요.</p>
      <Field label="명세 문서 경로 (건너뛰어도 돼요)">
        <input
          className="select"
          type="text"
          value={specPath}
          placeholder="docs/requirements.md"
          aria-describedby={`${id}-spec-hint`}
          onChange={(e) => setSpecPath(e.target.value)}
        />
      </Field>
      <p id={`${id}-spec-hint`} className="dim small">
        레포 안 Markdown 문서 경로예요. ## 제목마다 요구사항 구역이 생기고, 동기화할 때 다시 읽어요.
      </p>
      <label className="entry-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>내 GitHub 활동 기록을 모아 회고에 쓰는 데 동의해요</span>
      </label>
      {(shown || serverError) && (
        <em className="fld-error" role="alert">
          {shown ?? serverError}
        </em>
      )}
      <div className="entry-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          {busy ? '여는 중…' : '사무실 열기'}
        </button>
      </div>
    </form>
  )
}

function RepoRow({ org, repo, myWorkspaceIds, opening, setOpening, onEnter }: {
  org: OwnerChoice
  repo: RepositoryChoice
  myWorkspaceIds: ReadonlySet<string>
  opening: string | null
  setOpening: (id: string | null) => void
  onEnter: (workspaceId: string) => void
}) {
  const formOpen = opening === repo.githubRepoId
  let action
  if (repo.workspaceId !== null) {
    action = myWorkspaceIds.has(repo.workspaceId) ? (
      <button type="button" className="btn btn-sm" onClick={() => onEnter(repo.workspaceId!)}>
        들어가기
      </button>
    ) : (
      <span className="dim small">열려 있음</span>
    )
  } else if (!org.appInstalled) {
    action = <span className="dim small">앱 승인 뒤 열 수 있어요</span>
  } else if (repo.myRole === 'repo_admin') {
    action = formOpen ? null : (
      <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpening(repo.githubRepoId)}>
        사무실 열기
      </button>
    )
  } else {
    const admins = repo.adminLogins.map((l) => `@${l}`).join(', ')
    action = <span className="dim small">{admins ? `아직 열리지 않았어요 — 팀장 ${admins}에게 열어 달라고 해 주세요` : '아직 열리지 않았어요 — 레포 관리자에게 열어 달라고 해 주세요'}</span>
  }
  return (
    <li className={`entry-repo${formOpen ? ' is-open' : ''}`}>
      <div className="entry-repo-line">
        <span className="entry-repo-name">{repo.name}</span>
        {repo.myRole === 'repo_admin' && <span className="flag">레포 관리자</span>}
        <span className="grow" />
        {action}
      </div>
      {formOpen && <OpenWorkspaceForm repo={repo} onCancel={() => setOpening(null)} />}
    </li>
  )
}

/** 사무실 고르기 아래 — 조직 · 레포 목록. 레포를 고르지 않는 계정(심사용 · 강사)이면 아무것도 그리지 않는다 */
export function RepositoryChoices({ myWorkspaceIds, onEnter }: { myWorkspaceIds: ReadonlySet<string>; onEnter: (workspaceId: string) => void }) {
  const [repos, setRepos] = useState<RepositoryChoiceResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  // 강사 · 심사용 계정은 레포를 고르지 않는다(계약 「3」 — 늘 organizations: [])
  const picksRepos = useSession((s) => s.me?.accountType === 'github' && !s.me.isInstructor)

  useEffect(() => {
    let alive = true
    void useSession
      .getState()
      .listRepositories()
      .then((got) => {
        if (!alive) return
        if (got) setRepos(got)
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (failed) return <p className="entry-state">레포 목록을 받지 못했어요. 새로 고침해 주세요.</p>
  if (!repos) return <p className="entry-state">레포 목록을 읽는 중…</p>
  if (repos.organizations.length === 0 && !picksRepos) return null
  return (
    <section className="entry-repos" aria-labelledby="repos-title">
      <h2 id="repos-title" className="entry-subtitle">
        레포에서 사무실 열기
      </h2>
      <p className="dim small">레포 관리자가 레포의 사무실을 열면 팀원 모두가 들어올 수 있어요.</p>
      {/* 앱이 아직 설치되지 않은 조직은 GitHub가 서버에 보여 주지 않아 목록에 없을 수 있다(#238) — 그때를 위한 안내 */}
      <p className="dim small">팀 레포가 안 보이면 그 조직에 GRAVIT GitHub 앱이 아직 설치되지 않은 거예요. 조직 관리자에게 앱 설치를 부탁해 주세요.</p>
      {repos.organizations.map((org) => (
        <section key={org.githubOwnerId} className="entry-org" aria-label={`${org.login} 레포`}>
          <div className="entry-org-head">
            <strong>{org.login}</strong>
            {!org.appInstalled && <span className="flag flag-lock">앱 승인 필요</span>}
            <span className="grow" />
            {!org.appInstalled && org.installUrl && (
              <a className="gh-link" href={org.installUrl} target="_blank" rel="noopener noreferrer">
                승인 요청하기
              </a>
            )}
          </div>
          {org.repositories.length === 0 ? (
            <p className="dim small">보이는 레포가 없어요.</p>
          ) : (
            <ul className="entry-repo-list">
              {org.repositories.map((r) => (
                <RepoRow key={r.githubRepoId} org={org} repo={r} myWorkspaceIds={myWorkspaceIds} opening={opening} setOpening={setOpening} onEnter={onEnter} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
