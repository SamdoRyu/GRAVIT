// Right rail: detail drawer on top, management panel (tabs + search + body) below. OWNER: D.
// 칸반 · 목록은 v1 이슈 · PR만 보인다(데모 작업 칸반 · 필터는 뺐다 — #102 T5-c-2).
import { useOffice } from '../store'
import { DetailDrawer } from './Detail'
import { Icon } from './icons'
import { OfficeBoardSearch, OfficeKanban, OfficeList } from './OfficeBoard'
import { OfficeDetailDrawer } from './OfficeDetail'
import { WeekView } from './WeekView'
import { useUi, type Tab } from './uiState'

const TABS: { id: Tab; label: string }[] = [
  { id: 'kanban', label: '칸반' },
  { id: 'list', label: '목록' },
  { id: 'week', label: '주간' },
]

function Panel() {
  const tab = useUi((s) => s.tab)
  const wide = useUi((s) => s.wide)
  const taskCount = useOffice((s) => (s.office?.snapshot ? s.office.snapshot.tasks.length + s.office.snapshot.submissions.length : 0))
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
              {t.id !== 'week' && <span className="tab-count">{taskCount}</span>}
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
      {(tab === 'kanban' || tab === 'list') && <OfficeBoardSearch />}
      <div className={`panel-body panel-${tab}${tab === 'kanban' && wide ? ' is-wide-kanban' : ''}`}>
        {tab === 'kanban' && <OfficeKanban />}
        {tab === 'list' && <OfficeList />}
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
