// What a requirement plate on the deck shows (#16 · #17) — pure, no three. OWNER: C.
import type { RequirementDto } from '../data/types'

/** Cells on one plate (the design panel's grid, 5 × 2) */
export const PLATE_CELLS = 10

/**
 * Lit cells for a requirement's progress (doneTaskCount / linkedTaskCount — FR-REQ-05): the closed share of its linked issues,
 * rounded, but never all lit before every linked issue is closed and never none once one is.
 */
export function litCells(done: number, linked: number): number {
  if (linked <= 0 || done <= 0) return 0
  if (done >= linked) return PLATE_CELLS
  return Math.min(PLATE_CELLS - 1, Math.max(1, Math.round((done / linked) * PLATE_CELLS)))
}

/** The number in a `<badge>:<n>` count badge (SceneModel countBadge), 0 when absent */
export function badgeCount(badges: readonly string[], badge: string): number {
  const hit = badges.find((b) => b.startsWith(`${badge}:`))
  const n = hit ? Number(hit.slice(badge.length + 1)) : 0
  return Number.isFinite(n) ? n : 0
}

/** The plate's tag: source key (or the title when there is none) and progress, e.g. "FR-AUTH-01" · "1/3". No progress = no linked issue. */
export function plateTag(r: Pick<RequirementDto, 'sourceKey' | 'title' | 'linkedTaskCount' | 'doneTaskCount'>): { head: string; progress: string | null; title: string | null } {
  return {
    head: r.sourceKey ?? r.title,
    progress: r.linkedTaskCount > 0 ? `${r.doneTaskCount}/${r.linkedTaskCount}` : null,
    title: r.sourceKey ? r.title : null,
  }
}
