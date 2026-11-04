// 데모 store 팀원 → 정거장 자리표 · 그릴 포드 (CONTRACTS.md 「10」 작업 포드 표시 · 책상 자리가 없는 팀원).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Member } from '../../src/data/types'
import { OFFICE } from '../../src/office/layout'
import { demoSeats, podsShown } from '../../src/scene/stationSeats'

const member = (id: string, deskId: string) => ({ id, deskId }) as Member
const deskAt = (i: number) => OFFICE.desks[i].id

describe('stationSeats — 데모 팀원의 포드', () => {
  it('데모 책상 순서가 자리 번호이고, 포드가 없는 번호(8 · 9)는 자리가 없는 팀원이다', () => {
    const seats = demoSeats({ a: member('a', deskAt(0)), b: member('b', deskAt(7)), c: member('c', deskAt(8)), d: member('d', deskAt(9)) })
    assert.deepEqual([...seats], [['a', 0], ['b', 7]])
  })

  it('포드 0~3은 늘 그리고, 4~7은 앉은 팀원이 있을 때만 그린다', () => {
    assert.deepEqual([...podsShown(new Map())].sort(), [0, 1, 2, 3])
    assert.deepEqual([...podsShown(new Map([['a', 1], ['b', 5]]))].sort(), [0, 1, 2, 3, 5])
  })
})
