import { test, expect } from '@playwright/test'

const USERNAME = 'nguyenvana'
const PASSWORD = '123456'

test.use({ baseURL: 'http://127.0.0.1:3000' })

async function login(page) {
  await page.goto('/')
  await page.locator('#u').fill(USERNAME)
  await page.locator('#p').fill(PASSWORD)
  await page.getByRole('button', { name: /Truy cập hệ thống/ }).click()
  await expect(page.getByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeVisible({ timeout: 20_000 })
}

test('employee dashboard and node-detail logic smoke', async ({ page }, testInfo) => {
  const failures = []
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`))
  page.on('requestfailed', request => failures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`))

  await login(page)
  await page.screenshot({ path: testInfo.outputPath('employee-dashboard.png'), fullPage: true })

  const held = page.locator('article.ew-held').filter({ has: page.getByRole('button', { name: 'Mở ra làm' }) })
  const heldCount = await held.count()
  expect(heldCount).toBeGreaterThan(0)

  await held.first().getByRole('button', { name: 'Mở ra làm' }).click()
  await expect(page.getByRole('heading', { name: /Chi tiết tiến độ Node|Chi tiết/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Tủ hồ sơ đính kèm/).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('employee-node-detail.png'), fullPage: true })

  const submit = page.getByRole('button', { name: /Nộp nghiệm thu/ }).first()
  if (await submit.count()) {
    const disabled = await submit.isDisabled()
    console.log(`SUBMIT_DISABLED=${disabled}`)
    console.log('SUBMIT_CLICK_SKIPPED=read-only audit')
  }

  const preview = page.getByRole('button', { name: /Xem|Mở/ }).first()
  if (await preview.count()) {
    await preview.click()
    await page.waitForTimeout(500)
    const dialog = page.getByRole('dialog')
    console.log(`PREVIEW_DIALOG=${await dialog.count() > 0}`)
    if (await dialog.count()) await page.keyboard.press('Escape')
  }

  await page.screenshot({ path: testInfo.outputPath('employee-node-after-actions.png'), fullPage: true })
  console.log(`RUNTIME_FAILURES=${JSON.stringify(failures)}`)
  expect(failures.filter(item => !item.includes('/api/employee-portal/file')).length).toBe(0)
})

test('employee workflow remains usable on mobile', async ({ page }, testInfo) => {
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await expect(page.locator('body')).toBeVisible()
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  console.log(`MOBILE_SCROLL_WIDTH=${bodyWidth}`)
  expect(bodyWidth).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('employee-mobile.png'), fullPage: true })
  console.log(`MOBILE_FAILURES=${JSON.stringify(failures)}`)
  expect(failures).toEqual([])
})
