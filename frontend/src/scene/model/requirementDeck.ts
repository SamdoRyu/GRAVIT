// 요구사항 판 배치 — 판 수 · 기본 순서 · 대기 칸 · 교환(CONTRACTS.md 「8」 요구사항 판 배치 · 「10」, 2026-11-06 결정). 순수 함수,
// 테마를 모른다. SceneModel(buildSceneModel)과 대기 목록 HUD(D — #197)가 같은 결과를 쓴다. 숫자는 이 파일 한 곳. 소유: C.
import type { Id, RequirementDto } from '../../data/types'

/** 판 수 최소 — 요구사항이 적어도 이만큼 깐다(남는 자리는 빈 판) */
export const DECK_MIN_PLATES = 5
/** 판 수 최대 — 요구사항이 이보다 많으면 마지막 한 장이 대기 칸이다 */
export const DECK_MAX_PLATES = 10

export interface RequirementDeckPlan {
  /** 깔 판 수(5~10) — 요구사항 판 + 대기 칸 + 빈 판 */
  plates: number
  /** 판에 오른 요구사항, 판 순서 */
  shown: RequirementDto[]
  /** 판에 못 오른 요구사항(대기 칸), position 순서 */
  waiting: RequirementDto[]
}

/**
 * `active` 요구사항의 판 배치. `order` = 보는 사람이 교환해 둔 결과(판에 올린 요구사항 ID 목록, 사무실별 브라우저 저장 — 스토어가
 * 내준다).
 * - 10개 이하: 모두 판에(position 순서), 판 수 = max(5, n). 교환 결과는 쓰지 않는다.
 * - 11개 이상: 표기용 9장 + 대기 칸 1장. 교환 결과의 요구사항을 먼저 판에 놓고 남는 판을 position 순서로 채운다. 나머지는 대기 칸.
 * - 교환 결과에 `active`가 아닌 요구사항이 있으면 결과 전체를 버리고 position 순서로 그린다(「10」 버리는 때).
 */
export function planRequirementDeck(requirements: readonly RequirementDto[], order: readonly Id[] | null = null): RequirementDeckPlan {
  const active = requirements.filter((r) => r.status === 'active').sort((a, b) => a.position - b.position)
  if (active.length <= DECK_MAX_PLATES) return { plates: Math.max(DECK_MIN_PLATES, active.length), shown: active, waiting: [] }

  const room = DECK_MAX_PLATES - 1
  const byId = new Map(active.map((r) => [r.id, r]))
  const pinned = order && order.every((id) => byId.has(id)) ? [...new Set(order)].slice(0, room).map((id) => byId.get(id) as RequirementDto) : []
  const pinnedIds = new Set(pinned.map((r) => r.id))
  const rest = active.filter((r) => !pinnedIds.has(r.id))
  const fill = rest.slice(0, room - pinned.length)
  const shownIds = new Set([...pinnedIds, ...fill.map((r) => r.id)])
  return {
    plates: DECK_MAX_PLATES,
    shown: [...pinned, ...fill],
    waiting: active.filter((r) => !shownIds.has(r.id)),
  }
}
