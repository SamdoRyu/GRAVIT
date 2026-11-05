// v1 사무실의 관리 패널 칸반 · 목록 (#102 T5-c-2). 소유: D.
// 이슈 · PR은 GitHub 원본이라 읽기 전용 — 끌어서 상태 · 담당을 바꾸지 않고, 바꾸려면 GitHub 화면으로 간다(2026-10-28 결정).
import { memo, useMemo, type KeyboardEvent } from 'react'
import { kstToday } from '../data/rules/period'
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_META,
  KIND_LABEL,
  boardItems,
  dueLabel,
  matchesQuery,
  sortItems,
  type BoardColumn,
  type BoardItem,
  type BoardSortKey,
} from '../data/rules/board'
import type { Id, MemberDto } from '../data/types'
import { useOffice } from '../store'
import { Empty } from './common'
import { cssVars } from './format'
import { useNow } from './hooks'
import { Icon } from './icons'
import { FlagTags, GithubLink, MemberAvatar, NoMemberAvatar, PriorityMark } from './officeParts'
import { useUi } from './uiState'

type Members = ReadonlyMap<Id, MemberDto>

/** Snapshot의 이슈 · PR과 팀원. 사무실을 읽는 중이면 null */
function useBoardData(): { items: BoardItem[]; members: Members } | null {
  const tasks = useOffice((s) => s.office?.snapshot?.tasks)
  const submissions = useOffice((s) => s.office?.snapshot?.submissions)
  const memberList = useOffice((s) => s.office?.snapshot?.members)
  return useMemo(() => {
    if (!tasks || !submissions || !memberList) return null
    return { items: boardItems({ tasks, submissions }), members: new Map(memberList.map((m) => [m.id, m])) }
  }, [tasks, submissions, memberList])
}

function useFiltered(data: { items: BoardItem[]; members: Members } | null) {
  const query = useUi((s) => s.boardQuery)
  return useMemo(() => (data ? data.items.filter((it) => matchesQuery(it, data.members, query)) : []), [data, query])
}

/** 검색 줄 — 데모의 FilterBar 자리. `/`로 포커스(useHotkeys가 #hud-search를 찾는다) */
export function OfficeBoardSearch() {
  const query = useUi((s) => s.boardQuery)
  const set = useUi.getState().setBoardQuery
  return (
    <div className="filters">
      <div className="filters-row">
        <label className="search">
          <Icon name="search" size={14} />
          <input
            id="hud-search"
            type="search"
            value={query}
            placeholder="이슈 · PR 검색  ( / )"
            aria-label="이슈 · PR 검색"
            autoComplete="off"
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                if (query) set('')
                else e.currentTarget.blur()
              }
            }}
          />
        </label>
      </div>
    </div>
  )
}

/** 담당자 전원(이슈) 또는 작성자(PR). 첫 번째가 대표 담당자 */
function People({ item, members, showName = true }: { item: BoardItem; members: Members; showName?: boolean }) {
  if (item.memberIds.length === 0) {
    const none = item.kind === 'task' ? '담당 없음' : '팀원 아닌 작성자'
    return (
      <span className="assignee assignee-none" title={none}>
        <NoMemberAvatar />
        {showName && <span>{none}</span>}
      </span>
    )
  }
  const names = item.memberIds.map((id) => members.get(id)?.displayName ?? '알 수 없는 팀원')
  const lead = names[0]
  const more = names.length - 1
  return (
    <span className="assignee" title={`${item.kind === 'task' ? '담당' : '작성'}: ${names.join(', ')}`}>
      <span className="avatars">
        {item.memberIds.slice(0, 3).map((id) => (
          <MemberAvatar key={id} member={members.get(id)} />
        ))}
      </span>
      {showName && (
        <span className="assignee-name">
          {lead}
          {more > 0 && ` 외 ${more}명`}
        </span>
      )}
    </span>
  )
}

function ItemLink({ item }: { item: BoardItem }) {
  if (!item.htmlUrl) return null
  return <GithubLink href={item.htmlUrl} label={`GitHub에서 ${KIND_LABEL[item.kind]} #${item.number} 열기`} />
}

/** 카드 · 행을 누르면(또는 Enter · Space) 상세를 연다. 안쪽 링크에서 온 키는 링크가 처리한다 */
function useOpenDetail(item: BoardItem) {
  const selected = useOffice((s) => s.officeSelection?.kind === item.kind && s.officeSelection.id === item.id)
  const open = () => useOffice.getState().selectInOffice({ kind: item.kind, id: item.id })
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    open()
  }
  return { selected, open, onKeyDown }
}

const BoardCard = memo(function BoardCard({ item, members, today }: { item: BoardItem; members: Members; today: string }) {
  const due = dueLabel(item, today)
  const { selected, open, onKeyDown } = useOpenDetail(item)
  return (
    <article
      tabIndex={0}
      className={`card card-v1${item.flags.includes('blocked') ? ' is-blocked' : ''}${selected ? ' is-selected' : ''}`}
      aria-label={`${KIND_LABEL[item.kind]} #${item.number} ${item.title}`}
      aria-current={selected || undefined}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <div className="card-top">
        <PriorityMark priority={item.priority} />
        <span className={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
        <span className="card-key">#{item.number}</span>
        <FlagTags flags={item.flags} />
        {due && <span className={`due due-${due.tone}`}>{due.text}</span>}
      </div>
      <div className="card-title">{item.title}</div>
      <div className="card-foot">
        <People item={item} members={members} />
        <ItemLink item={item} />
      </div>
    </article>
  )
})

const Column = memo(function Column({ column, items, members, wide, today }: { column: BoardColumn; items: BoardItem[]; members: Members; wide: boolean; today: string }) {
  const meta = BOARD_COLUMN_META[column]
  const collapsed = useUi((s) => !wide && !!s.boardCollapsed[column])
  return (
    <section className={`col${wide ? ' col-wide' : ''}${collapsed ? ' is-collapsed' : ''}`} style={cssVars({ '--c': meta.color })} aria-label={`${meta.label} ${items.length}개`}>
      <button type="button" className="col-head" onClick={() => !wide && useUi.getState().toggleBoardCollapsed(column)} aria-expanded={!collapsed} disabled={wide} title={meta.hint}>
        {!wide && <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} />}
        <i className="dot" />
        <strong>{meta.label}</strong>
        <span className="col-count">{items.length}</span>
      </button>
      {!collapsed && (
        <div className="col-body">
          {items.length === 0 ? <div className="col-empty">비어 있어요</div> : items.map((it) => <BoardCard key={it.key} item={it} members={members} today={today} />)}
        </div>
      )}
    </section>
  )
})

function useToday(): string {
  const now = useNow(60_000)
  return kstToday(new Date(now))
}

export function OfficeKanban() {
  const data = useBoardData()
  const filtered = useFiltered(data)
  const wide = useUi((s) => s.wide)
  const today = useToday()
  const groups = useMemo(() => {
    const g: Record<BoardColumn, BoardItem[]> = { waiting: [], working: [], review: [], done: [] }
    for (const it of filtered) g[it.column].push(it)
    return g
  }, [filtered])

  if (!data || filtered.length === 0) return <BoardEmpty data={data} />
  return (
    <div className={`kanban${wide ? ' kanban-wide' : ''}`}>
      {BOARD_COLUMNS.map((c) => (
        <Column key={c} column={c} items={groups[c]} members={data.members} wide={wide} today={today} />
      ))}
    </div>
  )
}

const LIST_COLUMNS: { key: BoardSortKey; label: string; cls: string }[] = [
  { key: 'number', label: '번호', cls: 'c-key' },
  { key: 'title', label: '제목', cls: 'c-title' },
  { key: 'column', label: '상태', cls: 'c-status' },
  { key: 'priority', label: '우선', cls: 'c-prio' },
  { key: 'member', label: '담당', cls: 'c-who' },
  { key: 'due', label: '마감', cls: 'c-due' },
]

const Row = memo(function Row({ item, members, today }: { item: BoardItem; members: Members; today: string }) {
  const due = dueLabel(item, today)
  const col = BOARD_COLUMN_META[item.column]
  const key = `${KIND_LABEL[item.kind]} #${item.number}`
  const { selected, open, onKeyDown } = useOpenDetail(item)
  return (
    <div
      role="row"
      tabIndex={0}
      className={`lrow lrow-v1${selected ? ' is-selected' : ''}`}
      aria-label={`${key} ${item.title}`}
      aria-current={selected || undefined}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <span className="c-key" role="cell">
        {key}
      </span>
      <span className="c-title" role="cell" title={item.title}>
        <span className="l-title">{item.title}</span>
        <span className="l-sub">
          <span className="l-key">{key}</span>
          <FlagTags flags={item.flags} />
          <ItemLink item={item} />
        </span>
      </span>
      <span className="c-status" role="cell">
        <span className="spill" style={cssVars({ '--c': col.color })}>
          <i className="dot" />
          {col.label}
        </span>
      </span>
      <span className="c-prio" role="cell">
        <PriorityMark priority={item.priority} />
      </span>
      <span className="c-who" role="cell">
        <People item={item} members={members} showName={false} />
        <span className="l-who-name">{item.memberIds.length ? item.memberIds.map((id) => memberName(members, id)).join(', ') : '—'}</span>
      </span>
      <span className="c-due" role="cell">
        {due ? <span className={`due due-${due.tone}`}>{due.text}</span> : <span className="dim">—</span>}
      </span>
    </div>
  )
})

const memberName = (members: Members, id: Id) => members.get(id)?.displayName ?? '알 수 없는 팀원'

export function OfficeList() {
  const board = useBoardData()
  const filtered = useFiltered(board)
  const sort = useUi((s) => s.boardSort)
  const wide = useUi((s) => s.wide)
  const today = useToday()
  const rows = useMemo(() => (board ? sortItems(filtered, sort.key, sort.dir, board.members) : []), [board, filtered, sort])

  if (!board || rows.length === 0) return <BoardEmpty data={board} />
  return (
    <div className={`ltable ltable-v1${wide ? ' ltable-wide' : ''}`} role="table" aria-label="이슈 · PR 목록">
      <div className="lhead" role="row">
        {LIST_COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="columnheader"
            className={`${c.cls}${sort.key === c.key ? ' is-sorted' : ''}`}
            onClick={() => useUi.getState().setBoardSort(c.key)}
            aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {c.label}
            {sort.key === c.key && <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} />}
          </button>
        ))}
      </div>
      <div className="lbody" role="rowgroup">
        {rows.map((it) => (
          <Row key={it.key} item={it} members={board.members} today={today} />
        ))}
      </div>
    </div>
  )
}

/** 사무실 없음 · 읽는 중 · 실패 · 이슈 없음 · 검색 결과 없음 */
function BoardEmpty({ data }: { data: { items: BoardItem[] } | null }) {
  const status = useOffice((s) => s.office?.status ?? null)
  const query = useUi((s) => s.boardQuery)
  if (!data) {
    // 진입 흐름(로그인 · 사무실 고르기 — #64 · #68) 전에는 ?source=api에서 사무실이 열리지 않는다
    if (status === null) return <Empty icon="inbox" title="열린 사무실이 없어요" hint="로그인하고 사무실을 열면 이슈 · PR이 여기에 보여요." />
    return status === 'error' ? (
      <Empty icon="alert" title="사무실 데이터를 받지 못했어요" hint="잠시 뒤 다시 시도돼요." />
    ) : (
      <Empty icon="refresh" title="사무실을 불러오는 중…" />
    )
  }
  if (data.items.length === 0) return <Empty title="아직 이슈 · PR이 없어요" hint="GitHub에 이슈나 PR을 만들면 동기화 뒤 여기에 보여요." />
  return (
    <Empty
      icon="search"
      title={`"${query.trim()}"에 맞는 이슈 · PR이 없어요`}
      hint="제목 · #번호 · 라벨 · 사람 이름으로 찾을 수 있어요."
      action={
        <button type="button" className="btn btn-sm" onClick={() => useUi.getState().setBoardQuery('')}>
          검색 지우기
        </button>
      }
    />
  )
}
