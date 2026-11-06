// 강사 지정 · 해제 대화상자 (#53 — FR-AUTH-06, CONTRACTS_API.md 「7」). 소유: D.
// 지정된 강사는 사무실에 들어온 누구나 본다. 레포 관리자(R2)는 서버가 승인한 강사 계정(허용 목록) 중에서 지정하고 해제한다.
// 강사 목록은 Snapshot에 없어 열 때 읽고, 바꾼 뒤 다시 읽는다.
import { useEffect, useState } from 'react'
import { assignableCandidates, canManageInstructors, instructorName } from '../data/rules/instructors'
import type { InstructorAssignmentDto, InstructorCandidateDto } from '../data/types'
import { useOffice } from '../store'
import { Modal } from './Dialogs'
import { formatDate } from './format'
import { MemberAvatar } from './officeParts'
import './instructors.css'

function close() {
  useOffice.getState().openDialog(null)
}

/** 아바타 글자 — 이름 → 로그인(@ 없이) → '?' */
const avatarName = (x: { displayName?: string | null; githubLogin: string | null }) => x.displayName ?? x.githubLogin ?? '?'

interface Loaded {
  instructors: InstructorAssignmentDto[] | null
  /** R2가 아니면 읽지 않는다(null) */
  candidates: InstructorCandidateDto[] | null
}

export function InstructorDialog() {
  const viewer = useOffice((s) => s.office?.snapshot?.viewer ?? null)
  const canManage = viewer ? canManageInstructors(viewer) : false
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const st = useOffice.getState()
    void Promise.all([st.loadInstructors(), canManage ? st.loadInstructorCandidates() : Promise.resolve(null)]).then(([instructors, candidates]) => {
      if (!alive) return
      if (instructors === null) setFailed(true)
      else setLoaded({ instructors, candidates })
    })
    return () => {
      alive = false
    }
  }, [canManage, reload])

  const refresh = () => {
    setFailed(false)
    setReload((n) => n + 1)
  }

  const assign = async (c: InstructorCandidateDto) => {
    setBusy(c.githubUserId)
    const done = await useOffice.getState().assignInstructor(c.githubUserId)
    setBusy(null)
    if (!done) return
    useOffice.getState().toast('good', `${instructorName(done)} 님을 강사로 지정했어요`)
    refresh()
  }

  const revoke = async (i: InstructorAssignmentDto) => {
    setBusy(i.githubUserId)
    const ok = await useOffice.getState().revokeInstructor(i.githubUserId)
    setBusy(null)
    setConfirming(null)
    if (!ok) return
    useOffice.getState().toast('good', `${instructorName(i)} 님의 강사 지정을 해제했어요`)
    refresh()
  }

  const instructors = loaded?.instructors ?? null
  const candidates = loaded?.candidates ? assignableCandidates(loaded.candidates) : null

  return (
    <Modal title="강사" onClose={close} width={480}>
      <div className="modal-body ins">
        <p className="dim small ins-lead">강사는 이 사무실을 보고, 팀이 요청한 피드백 · 도움 요청에 답해요. 지정과 해제는 레포 관리자가 해요.</p>
        {failed ? (
          <div className="ins-state">
            <p className="notice notice-warn">강사 목록을 불러오지 못했어요.</p>
            <button type="button" className="btn btn-sm" onClick={refresh}>
              다시 읽기
            </button>
          </div>
        ) : instructors === null ? (
          <p className="dim small">불러오는 중…</p>
        ) : (
          <>
            <section className="ins-section" aria-labelledby="ins-current">
              <h3 id="ins-current" className="ins-title">
                지정된 강사 <span className="dim">{instructors.length}</span>
              </h3>
              {instructors.length === 0 ? (
                <p className="dim small">아직 지정된 강사가 없어요.</p>
              ) : (
                <ul className="ins-list" aria-label="지정된 강사">
                  {instructors.map((i) => {
                    const name = instructorName(i)
                    return (
                      <li key={i.githubUserId} className="ins-item" aria-label={name}>
                        <MemberAvatar member={{ displayName: avatarName(i) }} size={28} />
                        <span className="ins-who">
                          <strong>{name}</strong>
                          <span className="dim small">
                            {formatDate(i.assignedAt)} 지정 · {i.assignedBy.displayName}
                          </span>
                        </span>
                        {canManage &&
                          (confirming === i.githubUserId ? (
                            <span className="ins-confirm" role="group" aria-label={`${name} 강사 해제 확인`}>
                              <button type="button" className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => void revoke(i)}>
                                해제
                              </button>
                              <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setConfirming(null)}>
                                취소
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="btn btn-sm btn-ghost" aria-label={`${name} 강사 지정 해제`} onClick={() => setConfirming(i.githubUserId)}>
                              해제
                            </button>
                          ))}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {canManage && candidates !== null && (
              <section className="ins-section" aria-labelledby="ins-candidates">
                <h3 id="ins-candidates" className="ins-title">
                  승인된 강사 계정 <span className="dim">{candidates.length}</span>
                </h3>
                {candidates.length === 0 ? (
                  <p className="dim small">더 지정할 수 있는 승인된 강사 계정이 없어요. 강사 계정은 서버 설정에서 승인해요.</p>
                ) : (
                  <ul className="ins-list" aria-label="지정할 수 있는 강사">
                    {candidates.map((c) => {
                      const name = instructorName(c)
                      return (
                        <li key={c.githubUserId} className="ins-item" aria-label={name}>
                          <MemberAvatar member={{ displayName: avatarName(c) }} size={28} />
                          <span className="ins-who">
                            <strong>{name}</strong>
                            {c.githubLogin === null && <span className="dim small">아직 GRAVIT에 로그인한 적 없는 계정</span>}
                          </span>
                          <button type="button" className="btn btn-sm" disabled={busy !== null} aria-label={`${name} 강사로 지정`} onClick={() => void assign(c)}>
                            지정
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn" data-autofocus onClick={close}>
          닫기
        </button>
      </footer>
    </Modal>
  )
}
