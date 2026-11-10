// 36. glTF 모델 실패 처리 (#327): 스페이 · 라코 GLB를 못 받아도 정거장 · 이슈 상자는 그대로 그려지고 승무원만 빠진다.
// 네트워크가 돌아오면(online) 캐시를 비우고 다시 불러와 승무원이 나타난다. 리소스 실패는 콘솔 오류로 찍히므로 그 검사는 끄고,
// 3D 전체 실패(SceneBoundary의 "3D view failed")가 없는지는 따로 본다.
import { expect, openApp, test } from './fixtures'

test.use({ allowConsoleErrors: true })

const GLB = /\.glb(\?|$)/

function crewDrawn(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const rtPath = '/src/scene/runtime.ts'
    const rt = await import(/* @vite-ignore */ rtPath)
    return rt.avatarLive.size as number
  })
}

test('a model that fails to load drops only the crew, and comes back when the network returns', async ({ page, context, source }) => {
  const sceneFailures: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('3D view failed')) sceneFailures.push(m.text())
  })
  await context.route(GLB, (r) => r.abort())

  // The station and every issue / PR box still mount (openApp waits for them); no whole-scene failure screen.
  await openApp(page, source)
  await expect(page.getByText('3D 화면을 불러오지 못했어요')).toHaveCount(0)
  expect(await crewDrawn(page)).toBe(0)

  // Network back: the boundary clears the failed glTF cache and loads again.
  await context.unroute(GLB)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => crewDrawn(page), { message: 'crew drawn after retry' }).toBeGreaterThan(0)
  await expect(page.getByText('3D 화면을 불러오지 못했어요')).toHaveCount(0)
  expect(sceneFailures).toEqual([])
})
