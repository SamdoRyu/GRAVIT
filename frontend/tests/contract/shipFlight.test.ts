// 도킹 우주선 비행 — 사무실 바꾸기(scene/DockShip.tsx)의 떠남 · 도착 자세 (팀 결정 2026-11-09).
// 우주선은 가로로 누워 옆 해치가 연결 통로에 붙어 있다: 떠날 때 통로에서 떨어진(dz) 뒤 기수 쪽(forward)으로 가속한다.
// 도착할 때는 기수를 진행 방향(동쪽)으로 두고 들어와 멈추고, 세로로 반 바퀴 돌아(반 롤로 바로 서며) 기수를 서쪽으로 맞춘 뒤 통로에 붙는다.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INTRO_IN_S, SHIP_ARRIVE_S, SHIP_DEPART_S, SHIP_FAR, SHIP_INTRO_S, SHIP_STANDOFF, shipAxes, shipPose, warpLevel } from '../../src/scene/shipFlight'

const sample = (flight: 'depart' | 'arrive', end: number) => Array.from({ length: 49 }, (_, i) => shipPose(flight, (end * i) / 48))

describe('shipFlight — 떠남', () => {
  it('도킹 자리에서 시작해 통로에서 먼저 떨어지고(dz), 그다음 기수 쪽으로 간다 — 끝나면 화면 밖', () => {
    const poses = sample('depart', SHIP_DEPART_S)
    assert.deepEqual([poses[0].forward, poses[0].dz, poses[0].dy], [0, 0, 0])
    poses.slice(1).forEach((p, i) => {
      assert.ok(p.forward >= poses[i].forward && p.dz >= poses[i].dz, `t${i + 1}에서 되돌아오지 않는다`)
      // 통로에서 다 떨어지기 전에는 앞으로 가지 않는다(통로에 걸리지 않게)
      if (p.forward > 0) assert.equal(p.dz, poses[poses.length - 1].dz)
    })
    const last = poses[poses.length - 1]
    assert.equal(last.forward, SHIP_FAR)
    assert.ok(last.dz > 0)
    assert.equal(last.done, true)
    assert.ok(poses.slice(0, -1).every((p) => !p.done))
    assert.ok(poses.every((p) => p.yaw === 0 && p.pitch === 0 && p.roll === 0), '떠날 때는 돌지 않는다 — 기수 쪽으로 간다')
  })

  it('가속 — 끝으로 갈수록 빠르고 불꽃도 세진다', () => {
    const step = (t: number) => shipPose('depart', t + 0.05).forward - shipPose('depart', t).forward
    assert.ok(step(SHIP_DEPART_S - 0.1) > step(1.0) * 5)
    assert.ok(shipPose('depart', SHIP_DEPART_S - 0.1).thrust > shipPose('depart', 0.3).thrust)
  })
})

describe('shipFlight — 도착', () => {
  it('들어오는 동안은 기수가 진행 방향(동쪽) · 멈춘 뒤 세로로 돌고(기수가 위로) · 바로 선 채 기수 서쪽으로 붙는다', () => {
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
    const poses = sample('arrive', SHIP_ARRIVE_S)
    let wentUp = false
    for (const p of poses) {
      const { nose, up } = shipAxes(p)
      if (p.forward > 0) assert.ok(near(nose, [1, 0, 0]) && near(up, [0, 1, 0]), '들어오는 동안 기수 동쪽, 바로 선 채')
      // 세로로만 돈다 — 기수는 남북으로 기울지 않는다
      assert.ok(Math.abs(nose[2]) < 1e-9, '기수가 동서 · 위아래 평면 밖으로 나가지 않는다')
      if (nose[1] > 0.9) wentUp = true
      if (p.forward === 0 && p.dz < SHIP_STANDOFF) assert.ok(near(nose, [-1, 0, 0]) && near(up, [0, 1, 0]), '통로에 다가갈 때는 기수 서쪽, 바로 선 채')
      if (Math.abs(p.pitch) > 0 && p.pitch < Math.PI) assert.equal(p.dz, SHIP_STANDOFF, '도는 동안은 통로에서 떨어져 있다')
    }
    assert.ok(wentUp, '기수가 위로 들리며 돈다')
  })

  it('화면 밖에서 들어와 멈춘 뒤 통로에 붙는다 — 끝나면 도킹 자리에 불꽃 없이', () => {
    const poses = sample('arrive', SHIP_ARRIVE_S)
    assert.equal(poses[0].forward, SHIP_FAR)
    poses.slice(1).forEach((p, i) => {
      assert.ok(p.forward <= poses[i].forward && p.dz <= poses[i].dz)
      // 멈추기 전에는 통로 쪽으로 다가가지 않는다
      if (p.forward > 0) assert.equal(p.dz, poses[0].dz)
    })
    const last = poses[poses.length - 1]
    assert.deepEqual([last.forward, last.dz, last.dy, last.yaw, last.pitch, last.roll, last.thrust, last.done], [0, 0, 0, 0, 0, 0, 0, true])
  })

  it('시간이 넘쳐도 도킹 자리를 지나치지 않는다', () => {
    const p = shipPose('arrive', SHIP_ARRIVE_S * 3)
    assert.deepEqual([p.forward, p.dz, p.dy, p.yaw, p.pitch, p.roll], [0, 0, 0, 0, 0, 0])
  })
})

describe('shipFlight — 궤도 진입(intro)', () => {
  it('서쪽 아래(행성 지평선 쪽)에서 시작해 올라오며 다가오고, 기수는 진행 방향(동쪽)으로 올라가는 기울기만큼 든다', () => {
    const p0 = shipPose('intro', 0)
    assert.ok(p0.forward > 50 && p0.dy < -10, '멀리 서쪽 아래에서 시작')
    assert.ok(p0.pitch > 0, '올라가는 동안 기수가 들려 있다')
    const mid = shipPose('intro', INTRO_IN_S * 0.5)
    assert.ok(mid.forward < p0.forward && mid.dy > p0.dy, '다가오며 올라온다')
    const { nose } = shipAxes(mid)
    assert.ok(nose[0] > 0.9 && nose[1] > 0, '기수는 동쪽 · 위')
  })

  it('궤도를 다 올라오면 정거장 높이 · 통로 앞에 멈추고, 그다음은 정거장 사이 도착과 같이 붙는다', () => {
    const top = shipPose('intro', INTRO_IN_S - 1e-6)
    assert.ok(Math.abs(top.forward) < 0.01 && Math.abs(top.dy) < 0.01)
    assert.deepEqual(shipPose('intro', SHIP_INTRO_S), shipPose('arrive', SHIP_ARRIVE_S))
    assert.equal(shipPose('intro', SHIP_INTRO_S).done, true)
    assert.equal(shipPose('intro', SHIP_INTRO_S - 0.01).done, false)
  })
})

describe('shipFlight — 워프 세기', () => {
  it('떠남 마지막에 차올라 끝에 1, 도착 처음에 1에서 잦아들고, 궤도 진입(행성 줌인에서 이어짐)에는 워프가 없다', () => {
    assert.equal(warpLevel('depart', 0.2), 0)
    assert.equal(warpLevel('depart', SHIP_DEPART_S), 1)
    assert.ok(warpLevel('depart', SHIP_DEPART_S - 0.3) < warpLevel('depart', SHIP_DEPART_S - 0.1))
    assert.equal(warpLevel('arrive', 0), 1)
    assert.equal(warpLevel('arrive', 1.5), 0)
    assert.equal(warpLevel('intro', 0), 0)
  })
})
