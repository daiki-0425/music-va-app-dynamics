import { test, expect } from '@playwright/test'

test('register, annotate at 2 Hz, pause, save, and share progress across PCs', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page
    .getByRole('button', { name: '初めての方：アカウントを作成' })
    .click()
  await page.getByLabel('ユーザー名', { exact: true }).fill('browser_listener')
  await page.getByLabel('パスワード', { exact: true }).fill('browser-password')
  await page
    .getByRole('button', { name: 'アカウントを作成', exact: true })
    .click()
  await page.getByRole('button', { name: /01 Test Song/ }).click()
  const plane = page.getByRole('group', { name: /VA平面/ })
  await plane.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('valence', { exact: true })).toHaveValue('0.01')
  await page.getByLabel('valence', { exact: true }).fill('4.25')
  await page.getByLabel('arousal', { exact: true }).fill('-2.75')
  await expect(
    page.getByRole('button', { name: '保存して次へ' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '再生', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  const pausedCount = await page.locator('.sample-count strong').innerText()
  await page.waitForTimeout(600)
  await expect(page.locator('.sample-count strong')).toHaveText(pausedCount)
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true })
  await page.getByRole('button', { name: '再生', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存して次へ' })).toBeEnabled({
    timeout: 10000,
  })
  await expect(page.locator('.sample-count strong')).toHaveText('8 サンプル')
  await page.route(
    '**/api/annotations',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Temporary test failure' }),
      }),
    { times: 1 },
  )
  const request = page.waitForRequest(
    (r) => r.url().endsWith('/api/annotations') && r.method() === 'POST',
  )
  await page.getByRole('button', { name: '保存して次へ' }).click()
  const data = (await request).postDataJSON()
  expect(data.samples).toHaveLength(8)
  expect(data.samples.map((s: { time_ms: number }) => s.time_ms)).toEqual([
    0, 500, 1000, 1500, 2000, 2500, 3000, 3500,
  ])
  expect(
    data.samples.every(
      (s: { valence: number; arousal: number }) =>
        s.valence === 4.25 && s.arousal === -2.75,
    ),
  ).toBeTruthy()
  await expect(page.getByRole('alert')).toContainText('記録は保持しています')
  await expect(page.locator('.sample-count strong')).toHaveText('8 サンプル')
  const retry = page.waitForRequest(
    (r) => r.url().endsWith('/api/annotations') && r.method() === 'POST',
  )
  await page.getByRole('button', { name: '保存して次へ' }).click()
  expect((await retry).postDataJSON().id).toEqual(data.id)
  await expect(page.getByRole('status')).toContainText('評価を保存しました')
  await expect(page.locator('.player h2')).toHaveText('02 Next Song')
  const pc = await browser.newContext()
  const other = await pc.newPage()
  await other.goto('http://127.0.0.1:8011/')
  await other.getByLabel('ユーザー名', { exact: true }).fill('BROWSER_LISTENER')
  await other.getByLabel('パスワード', { exact: true }).fill('browser-password')
  await other.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(
    other.getByRole('button', { name: /01 Test Song.*評価済み/ }),
  ).toBeVisible()
  await other.setViewportSize({ width: 390, height: 844 })
  await expect(other.locator('main')).toBeVisible()
  expect(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy()
  await other.screenshot({ path: 'test-results/mobile.png', fullPage: true })
  await pc.close()
  expect(errors).toEqual([])
})
