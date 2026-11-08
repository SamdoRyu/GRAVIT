// 28. 데이터 소스는 탭에서 기억한다 (#236): GitHub 로그인 성공 처리는 고정 주소(/)로 돌려보내 ?source=api가 빠진다.
// 같은 탭에서 ?source 없이 돌아와도 api를 계속 쓰고, ?source=mock을 주면 다시 mock이다. 서버 대신 /api/**를 401로 가로챈다.
import { expect, readStore, test } from './fixtures'

// 가로챈 401을 브라우저가 "Failed to load resource" 콘솔 에러로 남긴다 — 일부러 낸 응답이다
test.use({ allowConsoleErrors: true })

test('?source=api survives the login round trip back to /, and ?source=mock switches back', async ({ page }) => {
  const apiPaths: string[] = []
  // 경로가 /api/로 시작하는 것만 — '**/api/**'는 Vite 모듈(/src/data/api/…)까지 잡는다
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    apiPaths.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: '로그인이 필요해요' } }) })
  })

  await page.goto('/?source=api')
  await expect.poll(() => apiPaths.includes('/api/me')).toBe(true)

  apiPaths.length = 0
  await page.goto('/') // 서버가 로그인 뒤 보내는 주소
  await expect.poll(() => apiPaths.includes('/api/me'), { message: 'still the api source' }).toBe(true)

  await page.goto('/?source=mock&workspace=ws_1')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null)).toBe('ready')
  apiPaths.length = 0
  await page.goto('/?workspace=ws_1')
  await expect.poll(() => readStore(page, (s) => s.office?.status ?? null), { message: 'mock remembered' }).toBe('ready')
  expect(apiPaths).toEqual([])
})
