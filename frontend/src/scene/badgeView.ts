// SceneModel badges → what a cargo box shows above it (#11 · #21 · #23). Pure: CargoBadges.tsx draws it.
// Icons follow the confirmed design's cargo badges (public/station — round, 16 px); the values follow the contract.
import { BADGE } from './model/buildSceneModel'

export type BadgeIcon = typeof BADGE.blocked | typeof BADGE.draft | typeof BADGE.unmergedClosed | typeof BADGE.notPlanned

/** Screen-reader / tooltip text of each icon — the fact only, never a reason (FR-FLOW-02). */
export const BADGE_LABEL: Record<BadgeIcon, string> = {
  [BADGE.blocked]: '막힘',
  [BADGE.draft]: 'Draft',
  [BADGE.unmergedClosed]: '미병합 종료',
  [BADGE.notPlanned]: '계획 안 함',
}

const ICONS = new Set<string>(Object.keys(BADGE_LABEL))

export interface CargoBadgeView {
  /** In SceneModel order (blocked first) */
  icons: BadgeIcon[]
  /** The current evaluation round's counts, when a round exists (#21) */
  votes: { recommend: number; notRecommend: number } | null
}

const COUNT = /^(recommend|not_recommend):(\d+)$/

/** Reads an entity's badges. Unknown values are ignored (a newer SceneModel may add badges this view doesn't draw yet). */
export function cargoBadgeView(badges: readonly string[]): CargoBadgeView {
  const icons: BadgeIcon[] = []
  let recommend: number | null = null
  let notRecommend: number | null = null
  for (const b of badges) {
    if (ICONS.has(b)) {
      icons.push(b as BadgeIcon)
      continue
    }
    const m = COUNT.exec(b)
    if (!m) continue
    if (m[1] === BADGE.recommend) recommend = Number(m[2])
    else notRecommend = Number(m[2])
  }
  const votes = recommend === null && notRecommend === null ? null : { recommend: recommend ?? 0, notRecommend: notRecommend ?? 0 }
  return { icons, votes }
}

/** Nothing to draw above the box */
export const isEmptyBadgeView = (v: CargoBadgeView) => v.icons.length === 0 && v.votes === null
