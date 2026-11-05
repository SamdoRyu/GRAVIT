// Right rail: detail drawer on top, management panel (tabs + filters + body) below. OWNER: ui-builder.
import { useOffice } from '../store'
import { DetailDrawer } from './Detail'
import { FilterBar } from './FilterBar'
import { Icon } from './icons'
import { KanbanView } from './KanbanView'
import { ListView } from './ListView'
import { OfficeBoardSearch, OfficeKanban, OfficeList } from './OfficeBoard'
import { OfficeDetailDrawer } from './OfficeDetail'
import { TeamView } from './TeamView'
import { WeekView } from './WeekView'
import { useUi, type Tab } from './uiState'

const TABS: { id: Tab; label: string }[] = [
  { id: 'kanban', label: '칸반' },
  { id: 'list', label: '목록' },
  { id: 'team', label: '팀원' },
  { id: 'week', label: '주간' },
]

function Panel() {
  const tab = useUi((s) => s.tab)
  const wide = useUi((s) => s.wide)
  // v1 사무실을 열었으면(읽는 중 · 실패 포함) 칸반 · 목록은 v1 이슈 · PR(읽기 전용), 아니면 아직 데모 작업 (#102 T5-c-2)
  const officeOpen = useOffice((s) => s.office !== null)
  const demoTaskCount = useOffice((s) => Object.keys(s.tasks).length)
  const boardCount = useOffice((s) => (s.office?.snapshot ? s.office.snapshot.tasks.length + s.office.snapshot.submissions.length : 0))
  const taskCount = officeOpen ? boardCount : demoTaskCount
  const memberCount = useOffice((s) => Object.keys(s.members).length)
  const ui = useUi.getState()

  return (
    <section className="panel glass" aria-label="관리 패널">
      <header className="panel-head">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'is-on' : ''}
              onClick={() => ui.setTab(t.id)}
            >
              {t.label}
              {t.id !== 'week' && <span className="tab-count">{t.id === 'team' ? memberCount : taskCount}</span>}
            </button>
          ))}
        </div>
        <span className="grow" />
        {tab !== 'week' && (
          <button
            type="button"
            className={`btn btn-sm btn-ghost${wide ? ' is-on' : ''}`}
            onClick={() => ui.setWide(!wide)}
            aria-pressed={wide}
            title={wide ? '좁게' : '넓게'}
          >
            <Icon name={wide ? 'shrink' : 'expand'} size={14} />
            <span className="btn-label">{wide ? '좁게' : '넓게'}</span>
          </button>
        )}
        <button type="button" className="btn btn-icon btn-ghost" onClick={() => ui.setPanelOpen(false)} aria-label="패널 접기" title="패널 접기">
          <Icon name="chevronRight" size={16} />
        </button>
      </header>
      {(tab === 'kanban' || tab === 'list') && (officeOpen ? <OfficeBoardSearch /> : <FilterBar />)}
      <div className={`panel-body panel-${tab}${tab === 'kanban' && wide ? ' is-wide-kanban' : ''}`}>
        {tab === 'kanban' && (officeOpen ? <OfficeKanban /> : <KanbanView />)}
        {tab === 'list' && (officeOpen ? <OfficeList /> : <ListView />)}
        {tab === 'team' && <TeamView />}
        {tab === 'week' && <WeekView />}
      </div>
    </section>
  )
}

export function Rail() {
  const panelOpen = useUi((s) => s.panelOpen)
  return (
    <div className="rail">
      <DetailDrawer />
      <OfficeDetailDrawer />
      {panelOpen ? (
        <Panel />
      ) : (
        <button type="button" className="panel-reopen glass" onClick={() => useUi.getState().setPanelOpen(true)} title="관리 패널 열기">
          <Icon name="chevronLeft" size={15} />
          관리 패널
        </button>
      )}
    </div>
  )
}
