// v1 사무실 화면(칸반 · 목록 · 상세)이 같이 쓰는 작은 조각 (#102 T5-c-2). 소유: D.
import type { MouseEvent } from 'react'
import { BOARD_FLAG_LABEL, PRIORITY_COLOR, PRIORITY_LABEL, type BoardFlag } from '../data/rules/board'
import type { MemberDto, Priority } from '../data/types'
import { cssVars, initialOf } from './format'
import { Icon } from './icons'

/** 팀원 동그라미 — 이름 첫 글자. 팀원을 못 찾으면 "알 수 없는 팀원" */
export function MemberAvatar({ member, size = 20 }: { member: Pick<MemberDto, 'displayName'> | undefined; size?: number }) {
  const name = member?.displayName ?? '알 수 없는 팀원'
  return (
    <span className="avatar avatar-v1" style={cssVars({ '--sz': `${size}px` })} title={name}>
      {initialOf(name)}
    </span>
  )
}

/** 사람 없음 — 점선 동그라미 */
export function NoMemberAvatar({ size = 20 }: { size?: number }) {
  return (
    <span className="avatar avatar-none" style={cssVars({ '--sz': `${size}px` })} aria-hidden="true">
      <Icon name="user" size={Math.round(size * 0.6)} />
    </span>
  )
}

export function PriorityMark({ priority, withLabel = false }: { priority: Priority | null; withLabel?: boolean }) {
  if (priority === null) {
    return withLabel ? <span className="prio dim">없음</span> : <span className="prio prio-none" title="우선순위 없음" />
  }
  return (
    <span className="prio" title={`우선순위 ${PRIORITY_LABEL[priority]}`}>
      <i className="dot" style={cssVars({ '--c': PRIORITY_COLOR[priority] })} />
      {withLabel && <span>{PRIORITY_LABEL[priority]}</span>}
    </span>
  )
}

export function FlagTags({ flags }: { flags: readonly BoardFlag[] }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f} className={`flag flag-${f}`}>
          {BOARD_FLAG_LABEL[f]}
        </span>
      ))}
    </>
  )
}

/** GitHub 화면 링크 — 새 탭. 카드 · 행을 누른 것으로 치지 않게 클릭을 멈춘다 */
export function GithubLink({ href, label, text = 'GitHub', className = 'gh-link' }: { href: string; label: string; text?: string; className?: string }) {
  const stop = (e: MouseEvent) => e.stopPropagation()
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={stop}>
      {text}
    </a>
  )
}
