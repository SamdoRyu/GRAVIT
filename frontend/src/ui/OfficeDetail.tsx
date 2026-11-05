// v1 사무실의 상세 서랍 — 이슈 · PR · 팀원 (#102 T5-c-2 · #12 FR-OFF-05). 소유: D.
// 읽기 전용이다. 편집 입력 없이, 상태 · 담당 변경은 GitHub 화면 링크로 간다.
// 팀원 상세에는 업무량 게이지 · 사람별 비교 값을 두지 않는다(FR-FLOW-06).
import type { ReactNode } from 'react'
import { BOARD_COLUMN_META, KIND_LABEL, dueLabel, monthDay, submissionItem, taskItem, type BoardItem } from '../data/rules/board'
import { REVIEW_STATE_LABEL, SUBMISSION_STATE_LABEL, latestReviews, memberWork, pick, taskStateLabel } from '../data/rules/detail'
import { kstToday } from '../data/rules/period'
import type { Id, MemberDto, SubmissionDto, TaskDto, WorkspaceSnapshot } from '../data/types'
import { useOffice, type OfficeSelection } from '../store'
import { cssVars, relativeTime } from './format'
import { useNow } from './hooks'
import { Icon } from './icons'
import { FlagTags, GithubLink, MemberAvatar, NoMemberAvatar, PriorityMark } from './officeParts'

const select = (s: OfficeSelection) => useOffice.getState().selectInOffice(s)

function CloseButton() {
  return (
    <button type="button" className="btn btn-icon btn-ghost" aria-label="상세 닫기 (Esc)" title="닫기 (Esc)" onClick={() => useOffice.getState().selectInOffice(null)}>
      <Icon name="close" size={16} />
    </button>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="fld dsec" aria-label={label}>
      <span className="fld-label">{label}</span>
      {children}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="dim small dnote">{children}</p>
}

/** 팀원 한 줄 — 누르면 그 팀원 상세 */
function PersonButton({ member, tag, after }: { member: MemberDto | undefined; tag?: string; after?: ReactNode }) {
  if (!member) {
    return (
      <span className="person is-unknown">
        <NoMemberAvatar />
        <span className="person-name">알 수 없는 팀원</span>
        {after}
      </span>
    )
  }
  return (
    <button type="button" className="person" onClick={() => select({ kind: 'member', id: member.id })}>
      <MemberAvatar member={member} />
      <span className="person-name">{member.displayName}</span>
      {tag && <span className="lead-tag">{tag}</span>}
      {after}
    </button>
  )
}

function People({ ids, members, empty, leadTag }: { ids: readonly Id[]; members: ReadonlyMap<Id, MemberDto>; empty: string; leadTag?: string }) {
  if (ids.length === 0) return <Note>{empty}</Note>
  return (
    <div className="people">
      {ids.map((id, i) => (
        <PersonButton key={id} member={members.get(id)} tag={i === 0 ? leadTag : undefined} />
      ))}
    </div>
  )
}

/** 이슈 · PR 목록 — 누르면 그 상세 */
function ItemList({ items, empty }: { items: readonly BoardItem[]; empty: string }) {
  if (items.length === 0) return <Note>{empty}</Note>
  return (
    <ul className="mini-tasks">
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" onClick={() => select({ kind: it.kind, id: it.id })}>
            <PriorityMark priority={it.priority} />
            <span className="card-key">
              {KIND_LABEL[it.kind]} #{it.number}
            </span>
            <span className="mini-title">{it.title}</span>
            <StatusPill item={it} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function StatusPill({ item }: { item: Pick<BoardItem, 'column'> }) {
  const meta = BOARD_COLUMN_META[item.column]
  return (
    <span className="spill" style={cssVars({ '--c': meta.color })}>
      <i className="dot" />
      {meta.label}
    </span>
  )
}

function Head({ item, children }: { item: BoardItem; children?: ReactNode }) {
  return (
    <div className="detail-head">
      <PriorityMark priority={item.priority} />
      <span className={`kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
      <span className="detail-key">#{item.number}</span>
      <FlagTags flags={item.flags} />
      {children}
      <span className="grow" />
      <CloseButton />
    </div>
  )
}

/** 아래 줄 — GitHub 화면으로. 시연 데이터는 링크가 없다 */
function Foot({ href, label, text, note }: { href: string | null; label: string; text: string; note: string }) {
  return (
    <div className="detail-foot">
      {href ? <GithubLink href={href} label={label} text={text} className="btn btn-sm gh-open" /> : <span className="dim small">시연 데이터라 GitHub 링크가 없어요</span>}
      <span className="grow" />
      <span className="dim small">{note}</span>
    </div>
  )
}

function Times({ rows }: { rows: [string, string | null][] }) {
  const now = useNow()
  const shown = rows.filter((r): r is [string, string] => r[1] !== null)
  return (
    <dl className="dtimes">
      {shown.map(([label, at]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            <time dateTime={at} title={new Date(at).toLocaleString('ko-KR')}>
              {relativeTime(at, now)}
            </time>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TaskDetail({ task, snapshot, members }: { task: TaskDto; snapshot: WorkspaceSnapshot; members: ReadonlyMap<Id, MemberDto> }) {
  const now = useNow(60_000)
  const item = taskItem(task)
  const due = dueLabel(item, kstToday(new Date(now)))
  const linked = pick(snapshot.submissions, task.linkedSubmissionIds).map(submissionItem)
  return (
    <aside className="detail glass detail-v1" aria-label="이슈 상세">
      <Head item={item}>{due && <span className={`due due-${due.tone}`}>{due.text}</span>}</Head>
      <div className="detail-body">
        <h3 className="detail-title">{task.title}</h3>
        <div className="dstate">
          <StatusPill item={item} />
          <span className="dim small">{taskStateLabel(task)}</span>
        </div>
        <div className="grid2">
          <Section label="우선순위">
            <PriorityMark priority={task.priority} withLabel />
          </Section>
          <Section label="마감">{task.dueDate ? <span>{monthDay(task.dueDate)}</span> : <span className="dim">없음</span>}</Section>
        </div>
        <Section label={`담당자 ${task.assigneeMemberIds.length}명`}>
          <People ids={task.assigneeMemberIds} members={members} empty="담당자가 없어요 — GitHub에서 지정해요." leadTag={task.assigneeMemberIds.length > 1 ? '대표' : undefined} />
        </Section>
        <Section label={`연결된 PR ${linked.length}개`}>
          <ItemList items={linked} empty="GitHub에서 이 이슈에 연결된 PR이 없어요." />
        </Section>
        {task.labels.length > 0 && (
          <Section label="라벨">
            <div className="dlabels">
              {task.labels.map((l) => (
                <span key={l} className="flag">
                  {l}
                </span>
              ))}
            </div>
          </Section>
        )}
        <Times
          rows={[
            ['만든 때', task.githubCreatedAt],
            ['상태 · 담당 바뀜', task.stateChangedAt],
            ['닫힌 때', task.closedAt],
          ]}
        />
      </div>
      <Foot href={task.htmlUrl} label={`GitHub에서 이슈 #${task.githubIssueNumber} 열기`} text="GitHub에서 열기" note="상태 · 담당은 GitHub에서 바꿔요" />
    </aside>
  )
}

function ReviewList({ submission, members }: { submission: SubmissionDto; members: ReadonlyMap<Id, MemberDto> }) {
  const reviews = latestReviews(submission.reviews)
  if (reviews.length === 0) return <Note>아직 리뷰가 없어요.</Note>
  return (
    <div className="people">
      {reviews.map((r) => {
        const tag = <span className={`review-state review-${r.state}`}>{REVIEW_STATE_LABEL[r.state]}</span>
        const member = r.reviewerMemberId === null ? undefined : members.get(r.reviewerMemberId)
        return member ? (
          <PersonButton key={`m:${member.id}`} member={member} after={tag} />
        ) : (
          <span key={`g:${r.reviewerGithubLogin}`} className="person is-outside">
            <NoMemberAvatar />
            <span className="person-name">@{r.reviewerGithubLogin}</span>
            {tag}
          </span>
        )
      })}
    </div>
  )
}

function SubmissionDetail({ submission, snapshot, members }: { submission: SubmissionDto; snapshot: WorkspaceSnapshot; members: ReadonlyMap<Id, MemberDto> }) {
  const item = submissionItem(submission)
  const linked = pick(snapshot.tasks, submission.linkedTaskIds).map(taskItem)
  const open = submission.state === 'open' || submission.state === 'draft'
  const round = submission.currentRound
  const author = submission.authorMemberId === null ? undefined : members.get(submission.authorMemberId)
  return (
    <aside className="detail glass detail-v1" aria-label="PR 상세">
      <Head item={item} />
      <div className="detail-body">
        <h3 className="detail-title">{submission.title}</h3>
        <div className="dstate">
          <StatusPill item={item} />
          <span className="dim small">{SUBMISSION_STATE_LABEL[submission.state]}</span>
        </div>
        <Section label="작성자">
          {author ? (
            <div className="people">
              <PersonButton member={author} />
            </div>
          ) : (
            <Note>{submission.authorGithubLogin ? `@${submission.authorGithubLogin} (팀원 아님)` : '알 수 없어요'}</Note>
          )}
        </Section>
        <Section label="리뷰">
          <ReviewList submission={submission} members={members} />
        </Section>
        {open && (
          <Section label={`리뷰 요청 ${submission.reviewRequestedMemberIds.length}명`}>
            <People ids={submission.reviewRequestedMemberIds} members={members} empty="리뷰를 요청한 팀원이 없어요." />
          </Section>
        )}
        {open && submission.suggestedReviewerMemberIds.length > 0 && (
          <Section label="추천 리뷰어">
            <People ids={submission.suggestedReviewerMemberIds} members={members} empty="" />
          </Section>
        )}
        <Section label="추천 · 비추천 평가">
          {round ? (
            <p className="dround">
              {round.roundNumber}회차 · 추천 <b>{round.recommendCount}</b> · 비추천 <b>{round.notRecommendCount}</b>
            </p>
          ) : (
            <Note>아직 평가 회차가 없어요.</Note>
          )}
        </Section>
        <Section label={`연결된 이슈 ${linked.length}개`}>
          <ItemList items={linked} empty="GitHub에서 이 PR에 연결된 이슈가 없어요." />
        </Section>
        <Times
          rows={[
            ['연 때', submission.githubCreatedAt],
            ['마지막 커밋', submission.lastCommitAt],
            ['머지된 때', submission.mergedAt],
            ['닫힌 때', submission.state === 'closed' ? submission.closedAt : null],
          ]}
        />
      </div>
      <Foot href={submission.htmlUrl} label={`GitHub에서 PR #${submission.githubPrNumber} 열기`} text="GitHub PR 화면" note="리뷰 · 머지는 GitHub에서 해요" />
    </aside>
  )
}

function MemberDetail({ member, snapshot }: { member: MemberDto; snapshot: WorkspaceSnapshot }) {
  const work = memberWork(snapshot, member.id)
  const profile = member.githubLogin ? `https://github.com/${encodeURIComponent(member.githubLogin)}` : null
  return (
    <aside className="detail glass detail-v1" aria-label="팀원 상세">
      <div className="detail-head">
        <MemberAvatar member={member} size={32} />
        <div className="detail-who">
          <strong>{member.displayName}</strong>
          <span className="dim">{member.githubLogin ? `@${member.githubLogin}` : 'GitHub 계정 없음'}</span>
        </div>
        {member.isRepoAdmin && <span className="lead-tag">레포 관리자</span>}
        {member.removedAt !== null && <span className="flag">빠진 팀원</span>}
        <span className="grow" />
        <CloseButton />
      </div>
      <div className="detail-body">
        <Section label={`맡은 열린 이슈 ${work.openTasks.length}개`}>
          <ItemList items={work.openTasks.map(taskItem)} empty="맡은 열린 이슈가 없어요." />
        </Section>
        <Section label={`연 PR ${work.openSubmissions.length}개`}>
          <ItemList items={work.openSubmissions.map(submissionItem)} empty="열려 있는 PR이 없어요." />
        </Section>
        <Section label={`리뷰 요청 받은 PR ${work.reviewRequests.length}개`}>
          <ItemList items={work.reviewRequests.map(submissionItem)} empty="리뷰를 기다리는 PR이 없어요." />
        </Section>
      </div>
      <Foot href={profile} label={`GitHub에서 ${member.displayName} 프로필 열기`} text="GitHub 프로필" note="담당 · 리뷰 요청은 GitHub에서 바꿔요" />
    </aside>
  )
}

/** v1 사무실에서 고른 것의 상세. 고른 것이 없거나 Snapshot에 없으면 아무것도 그리지 않는다 */
export function OfficeDetailDrawer() {
  const sel = useOffice((s) => s.officeSelection)
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  if (!sel || !snapshot) return null
  const members = new Map(snapshot.members.map((m) => [m.id, m]))
  if (sel.kind === 'task') {
    const task = snapshot.tasks.find((t) => t.id === sel.id)
    return task ? <TaskDetail key={task.id} task={task} snapshot={snapshot} members={members} /> : null
  }
  if (sel.kind === 'submission') {
    const sub = snapshot.submissions.find((s) => s.id === sel.id)
    return sub ? <SubmissionDetail key={sub.id} submission={sub} snapshot={snapshot} members={members} /> : null
  }
  const member = members.get(sel.id)
  return member ? <MemberDetail key={member.id} member={member} snapshot={snapshot} /> : null
}
