// 30. Meeting start / end moves the attendees between their pods and the bridge (CONTRACTS.md 「10」 아바타 이동 연출 · #10):
// each fades out, a light dot in its crew colour runs along the tubes, and it appears at a bridge seat (pod order → seat 0, 1, …).
// Ending the meeting brings them back to their pods the same way. Non-attendees stay where they are.
import type { Page } from '@playwright/test'
import { callStore, expect, openApp, readStore, test } from './fixtures'

/** Live avatar positions and whether each member's light dot is showing, plus where the spots are. */
function crewState(page: Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const spotsPath = '/src/theme/station/spots.ts'
    const storePath = '/src/store.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    const { bridgeSeat, crewSpot } = await import(/* @vite-ignore */ spotsPath)
    const { useOffice } = await import(/* @vite-ignore */ storePath)
    const snap = useOffice.getState().office.snapshot
    const seated = (snap.members as { id: string; removedAt: string | null; deskIndex: number | null }[])
      .filter((m) => m.removedAt === null && m.deskIndex !== null && m.deskIndex < 8)
      .sort((a, b) => a.deskIndex! - b.deskIndex!)
    return seated.map((m) => {
      const a = rt.avatarLive.get(m.id)
      return {
        id: m.id,
        at: a ? [a.x, a.z] : null,
        pod: [crewSpot(m.deskIndex, true).x, crewSpot(m.deskIndex, true).z],
        bridge: [0, 1, 2, 3].map((i) => [bridgeSeat(i).x, bridgeSeat(i).z]),
        dot: rt.trailLive.get(m.id)?.visible === true,
      }
    })
  })
}

const near = (a: number[] | null, b: number[]) => a !== null && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05

test('a meeting start sends the attendees along the tubes to the bridge, and its end brings them back', async ({ page, source }) => {
  await openApp(page, source)
  const before = await crewState(page)
  expect(before.length).toBeGreaterThanOrEqual(3)
  for (const c of before) expect(near(c.at, c.pod)).toBe(true)
  const [first, , third] = before
  const attendees = [third.id, first.id]

  // Start: some light dot shows on the way, then the attendees sit at bridge seats 0 · 1 in pod order.
  const sawDot = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const rtPath = '/src/scene/runtime.ts'
        void import(/* @vite-ignore */ rtPath).then((rt) => {
          const until = performance.now() + 5000
          const tick = () => {
            if ([...rt.trailLive.values()].some((t: { visible: boolean }) => t.visible)) return resolve(true)
            if (performance.now() > until) return resolve(false)
            requestAnimationFrame(tick)
          }
          tick()
        })
      }),
  )
  await callStore(page, 'startOfficeMeeting', attendees)
  expect(await sawDot).toBe(true)
  await expect
    .poll(async () => {
      const s = await crewState(page)
      const by = new Map(s.map((c) => [c.id, c]))
      return near(by.get(first.id)!.at, first.bridge[0]) && near(by.get(third.id)!.at, first.bridge[1]) && s.every((c) => !c.dot)
    })
    .toBe(true)
  // A non-attendee stays in its pod.
  const second = (await crewState(page))[1]
  expect(near(second.at, second.pod)).toBe(true)

  // End: they go back to their pods.
  const meetingId = await readStore(page, (s) => s.office.snapshot.meetings.find((m: { status: string }) => m.status === 'ongoing')?.id)
  await callStore(page, 'endOfficeMeeting', meetingId, null)
  await expect.poll(async () => (await crewState(page)).every((c) => near(c.at, c.pod) && !c.dot)).toBe(true)
})
