// 관리 패널 "스탠드업" 탭 (#190 — FR-MTG-01 · 02 · FR-LRN-15, CONTRACTS_API.md 「12」). 소유: A (D 동의 — 2026-11-06).
// 스탠드업은 Snapshot에 없어 날짜로 읽는다. 날짜는 한국 시간. 강사는 보기만 한다(쓰기 · 미리 채우기는 팀원만).
import { useEffect, useState, type FormEvent } from 'react'
import { blankToNull } from '../data/rules/meeting'
import { addLocalDays, kstToday } from '../data/rules/period'
import { STANDUP_TEXT_MAX, prefillText, standupSaveError } from '../data/rules/standup'
import type { Id, LocalDate, MemberDto, StandupDto } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { formatMonthDay, relativeTime } from './format'
import { TextField } from './HelpBoard'
import { useNow } from './hooks'
import { Icon } from './icons'
import { MemberAvatar } from './officeParts'
import { useUi } from './uiState'
import './help.css'

export function StandupPanel() {
  const members = useOffice((s) => s.office?.snapshot?.members ?? null)
  const viewer = useOffice((s) => s.office?.snapshot?.viewer ?? null)
  const now = useNow(60_000)
  const today = kstToday(new Date(now))
  const [date, setDate] = useState<LocalDate>(today)
  const [reload, setReload] = useState(0)
  // 읽은 결과를 무엇을 읽었는지(key)와 함께 둔다 — 날짜를 바꾸면 이전 결과는 그 자리에서 버려진다. list null = 읽기 실패
  const key = `${date}|${reload}`
  const [loaded, setLoaded] = useState<{ key: string; list: StandupDto[] | null } | null>(null)

  useEffect(() => {
    let alive = true
    void useOffice
      .getState()
      .loadStandups(date)
      .then((got) => {
        if (alive) setLoaded({ key, list: got })
      })
    return () => {
      alive = false
    }
  }, [date, key])

  const current = loaded?.key === key ? loaded : null
  const list = current?.list ?? null
  const failed = current !== null && current.list === null

  if (!members || !viewer) return <Empty icon="refresh" title="사무실을 불러오는 중…" />
  const canWrite = viewer.role !== 'instructor' && viewer.memberId !== null
  const mine = list?.find((s) => s.memberId === viewer.memberId) ?? null
  const team = members.filter((m) => m.removedAt === null)

  return (
    <div className="help standup">
      <div className="standup-nav" role="group" aria-label="날짜">
        <button type="button" className="btn btn-icon btn-ghost" aria-label="이전 날" onClick={() => setDate(addLocalDays(date, -1))}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <strong className="standup-date">
          {formatMonthDay(date)}
          {date === today && <span className="help-tag">오늘</span>}
        </strong>
        <button type="button" className="btn btn-icon btn-ghost" aria-label="다음 날" disabled={date >= today} onClick={() => setDate(addLocalDays(date, 1))}>
          <Icon name="chevronRight" size={16} />
        </button>
        <span className="grow" />
        {date !== today && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDate(today)}>
            오늘로
          </button>
        )}
      </div>

      {failed ? (
        <Empty icon="alert" title="스탠드업을 불러오지 못했어요" action={<button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>다시 읽기</button>} />
      ) : list === null ? (
        <p className="dim small dnote">불러오는 중…</p>
      ) : (
        <>
          {canWrite && <MyStandupForm key={`${date}|${mine?.updatedAt ?? 'new'}`} date={date} today={today} mine={mine} onSaved={() => setReload((n) => n + 1)} />}
          <ul className="help-comments" aria-label="팀원 스탠드업">
            {team.map((m) => (
              <StandupItem key={m.id} member={m} standup={list.find((s) => s.memberId === m.id) ?? null} now={now} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function StandupItem({ member, standup, now }: { member: MemberDto; standup: StandupDto | null; now: number }) {
  return (
    <li className="help-comment" aria-label={`${member.displayName}의 스탠드업`}>
      <span className="help-item-foot">
        <MemberAvatar member={member} size={18} />
        <strong>{member.displayName}</strong>
        {standup && <span className="dim">· {relativeTime(standup.updatedAt, now)}</span>}
      </span>
      {standup ? (
        <>
          <p className="help-comment-text">{standup.yesterday || <span className="dim">어제 한 일 없음</span>}</p>
          {standup.blockers && (
            <p className="help-note help-note-warn standup-blockers">
              <strong>막힌 것</strong> {standup.blockers}
            </p>
          )}
        </>
      ) : (
        <p className="dim small dnote">아직 안 썼어요</p>
      )}
    </li>
  )
}

function MyStandupForm({ date, today, mine, onSaved }: { date: LocalDate; today: LocalDate; mine: StandupDto | null; onSaved: () => void }) {
  const [yesterday, setYesterday] = useState(mine?.yesterday ?? '')
  const [blockers, setBlockers] = useState(mine?.blockers ?? '')
  const [busy, setBusy] = useState(false)
  const [filling, setFilling] = useState(false)
  const request = { yesterday: yesterday.trim(), blockers: blankToNull(blockers) }
  const error = standupSaveError(date, request, today)

  const fill = async () => {
    setFilling(true)
    const prefill = await useOffice.getState().loadStandupPrefill(date)
    setFilling(false)
    if (!prefill) return
    if (prefill.items.length === 0) {
      useOffice.getState().toast('info', '전날 GitHub 활동이 없어요')
      return
    }
    const text = prefillText(prefill)
    setYesterday((cur) => (cur.trim() ? `${cur.trimEnd()}\n${text}` : text))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (error || busy) return
    setBusy(true)
    const saved = await useOffice.getState().saveMyStandup(date, request)
    setBusy(false)
    if (saved) {
      useOffice.getState().toast('good', '스탠드업을 저장했어요')
      onSaved()
    }
  }

  return (
    <form className="help-form" onSubmit={submit} noValidate aria-label="내 스탠드업">
      <TextField label="어제 한 일" value={yesterday} max={STANDUP_TEXT_MAX} rows={3} error={null} placeholder="어제 한 일을 적거나 GitHub 활동으로 채워 보세요" onChange={setYesterday} />
      <TextField label="막힌 것" value={blockers} max={STANDUP_TEXT_MAX} rows={2} error={null} placeholder="없으면 비워 두세요" onChange={setBlockers} />
      {error && (
        <em className="fld-error" role="alert">
          {error}
        </em>
      )}
      <div className="help-actions standup-actions">
        <button type="button" className="btn btn-sm" disabled={filling} onClick={() => void fill()}>
          GitHub 활동으로 채우기
        </button>
        <span className="grow" />
        {mine?.blockers && <HelpFromBlockers standupId={mine.id} blockers={mine.blockers} />}
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !!error}>
          {mine ? '고치기' : '저장'}
        </button>
      </div>
    </form>
  )
}

/** 저장된 "막힌 것"을 도움 요청 쓰기 폼으로 넘긴다 — 올리는 것은 요청자가 확인한 뒤 (CONTRACTS_API.md 「12」) */
function HelpFromBlockers({ standupId, blockers }: { standupId: Id; blockers: string }) {
  return (
    <button type="button" className="btn btn-sm" onClick={() => useUi.getState().startHelpDraft({ content: blockers, fromStandupId: standupId })}>
      막힌 것을 도움 요청으로
    </button>
  )
}
