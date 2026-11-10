// 28. API is the default after every page load, including GitHub's redirect back to `/`.
// A legacy saved mock choice must not override it; only `?source=mock` opts into mock data.
import { expect, test } from './fixtures'

// The API 401s and intercepted OAuth handoff are intentional in this frontend-only flow test.
test.use({ allowConsoleErrors: true })

test('the root uses API despite a legacy saved mock, and explicit mock remains available', async ({ page }) => {
  const apiPaths: string[] = []
  let oauthStarted = false

  // Simulate the sessionStorage value left by earlier versions of the app.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('gravit.source', 'mock')
    } catch {
      /* storage blocked */
    }
  })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const path = new URL(route.request().url()).pathname
    apiPaths.push(path)
    if (path === '/api/login-options') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ githubLoginUrl: '/oauth2/authorization/github', reviewLoginEnabled: false }),
      })
    }
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: '로그인이 필요해요' } }),
    })
  })
  await page.route((url) => url.pathname === '/oauth2/authorization/github', (route) => {
    oauthStarted = true
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'OAuth route reached' })
  })

  await page.goto('/')
  await expect.poll(() => apiPaths.includes('/api/me')).toBe(true)
  await expect.poll(() => apiPaths.includes('/api/login-options')).toBe(true)
  await expect(page.getByRole('button', { name: 'GitHub로 로그인' })).toBeVisible()
  await expect(page.getByText('요청하는 권한은 GitHub 승인 화면에서 확인할 수 있어요.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gravit.source'))).toBeNull()

  await page.getByRole('button', { name: 'GitHub로 로그인' }).click()
  await expect.poll(() => oauthStarted).toBe(true)
  await expect(page).toHaveURL(/\/oauth2\/authorization\/github$/)
  await expect(page.getByText('OAuth route reached')).toBeVisible()

  apiPaths.length = 0
  await page.goto('/?source=mock')
  await expect(page.getByRole('heading', { name: '사무실 고르기' })).toBeVisible()
  expect(apiPaths).toEqual([])

  // Returning to the unadorned callback URL chooses API even after the explicit mock visit.
  await page.goto('/')
  await expect.poll(() => apiPaths.includes('/api/me')).toBe(true)
  await expect.poll(() => apiPaths.includes('/api/login-options')).toBe(true)
})
