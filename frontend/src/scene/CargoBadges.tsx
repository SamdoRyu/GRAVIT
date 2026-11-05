// The row of badges above one cargo box: the design's round 16 px icons (blocked · Draft · 미병합 종료 · 계획 안 함) and a
// small recommend / not-recommend count pill for a PR's current round. Mounted once per box that has badges (drei's Html
// misbehaves when mounted / unmounted often) and placed in the box's own group, so it moves with the box.
import { memo } from 'react'
import { BADGE } from './model/buildSceneModel'
import { BADGE_LABEL, type BadgeIcon, type CargoBadgeView } from './badgeView'
import { SceneHtml } from './shared'

const NAVY = '#232a5c'
const CREAM = '#fffaf0'
const ORANGE = '#f29a52'
const TEAL = '#8ff0e0'

/** Icon glyphs on a 16-unit canvas centred at 0 (the design's badge geometry: r 7.4 disc, 1.4 cream outline). */
function Glyph({ icon }: { icon: BadgeIcon }) {
  switch (icon) {
    case BADGE.blocked: // the design's 'warn': orange disc, navy triangle
      return (
        <>
          <circle r="7.4" fill={ORANGE} stroke={CREAM} strokeWidth="1.4" />
          <path d="M0 -4.6 L4.4 3.2 L-4.4 3.2 Z" fill={NAVY} />
          <rect x="-.6" y="-1.8" width="1.2" height="2.8" fill="#ffd2a6" />
          <rect x="-.6" y="1.6" width="1.2" height="1" fill="#ffd2a6" />
        </>
      )
    case BADGE.draft: // dashed ring: not ready yet
      return (
        <>
          <circle r="7.4" fill={NAVY} stroke={CREAM} strokeWidth="1.4" />
          <circle r="3.6" fill="none" stroke={CREAM} strokeWidth="1.5" strokeDasharray="2 1.8" />
        </>
      )
    case BADGE.unmergedClosed: // a cross: closed without merging
      return (
        <>
          <circle r="7.4" fill={NAVY} stroke={CREAM} strokeWidth="1.4" />
          <path d="M-2.8 -2.8 L2.8 2.8 M2.8 -2.8 L-2.8 2.8" stroke={ORANGE} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )
    case BADGE.notPlanned: // a slashed circle
      return (
        <>
          <circle r="7.4" fill={NAVY} stroke={CREAM} strokeWidth="1.4" />
          <circle r="3.6" fill="none" stroke={CREAM} strokeWidth="1.4" />
          <path d="M-2.5 2.5 L2.5 -2.5" stroke={CREAM} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )
  }
}

const pill = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 16,
  padding: '0 6px',
  borderRadius: 999,
  background: NAVY,
  border: `1.4px solid ${CREAM}`,
  font: '700 10px var(--font, sans-serif)',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
} as const

export const CargoBadges = memo(function CargoBadges({ view, y }: { view: CargoBadgeView; y: number }) {
  const { icons, votes } = view
  const voteText = votes ? `추천 ${votes.recommend} · 비추천 ${votes.notRecommend}` : ''
  return (
    <SceneHtml position={[0, y, 0]} center zIndexRange={[0, 0]} pointerEvents="none">
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, userSelect: 'none', filter: 'drop-shadow(0 1px 2px rgba(17,24,56,.45))' }}>
        {icons.map((icon) => (
          <svg key={icon} width="16" height="16" viewBox="-8 -8 16 16" role="img" aria-label={BADGE_LABEL[icon]}>
            <title>{BADGE_LABEL[icon]}</title>
            <Glyph icon={icon} />
          </svg>
        ))}
        {votes && (
          <span style={pill} role="img" aria-label={voteText} title={voteText}>
            <span style={{ color: TEAL }}>▲{votes.recommend}</span>
            <span style={{ color: ORANGE }}>▼{votes.notRecommend}</span>
          </span>
        )}
      </div>
    </SceneHtml>
  )
})
