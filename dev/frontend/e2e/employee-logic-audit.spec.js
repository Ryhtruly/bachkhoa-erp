import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD

if (!username || !password) {
  throw new Error('Set E2E_USERNAME and E2E_PASSWORD environment variables')
}

test.use({ baseURL })

function setupRuntimeErrorCollector(page) {
  const failures = []

  page.on('console', message => {
    if (message.type() === 'error') {
      const sourceUrl = message.location().url || ''
      const sourceHost = sourceUrl ? new URL(sourceUrl).hostname : ''
      const isExternalFont =
        sourceHost === 'fonts.googleapis.com' || sourceHost === 'fonts.gstatic.com'

      if (!isExternalFont) {
        failures.push(`console: ${message.text()} (${sourceUrl || 'unknown-url'})`)
      }
    }
  })

  page.on('pageerror', error => {
    failures.push(`pageerror: ${error.message}`)
  })

  page.on('requestfailed', request => {
    const requestUrl = new URL(request.url())
    const errorText = request.failure()?.errorText || ''
    const isExternalFont =
      requestUrl.hostname === 'fonts.googleapis.com' || requestUrl.hostname === 'fonts.gstatic.com'
    const isSseTeardown =
      /AbortError|ERR_ABORTED/.test(errorText) &&
      ['/api/notifications/events', '/api/employee-portal/events'].includes(requestUrl.pathname)

    if (isExternalFont || isSseTeardown) return

    failures.push(
      `requestfailed: ${request.method()} ${request.url()} ${errorText}`.trim(),
    )
  })

  page.on('response', response => {
    const responseUrl = new URL(response.url())
    const isExternalFont =
      responseUrl.hostname === 'fonts.googleapis.com' || responseUrl.hostname === 'fonts.gstatic.com'

    if (response.status() >= 400 && !isExternalFont) {
      failures.push(
        `http5xx: ${response.status()} ${response.request().method()} ${response.url()}`,
      )
    }
  })

  return failures
}

async function login(page) {
  await page.goto('/')
  await page.locator('#u').fill(username)
  await page.locator('#p').fill(password)
  await page.getByRole('button', { name: /Truy cập hệ thống/ }).click()
  await expect(page.getByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeVisible({ timeout: 20_000 })
}

test('employee dashboard and node-detail logic smoke', async ({ page }, testInfo) => {
  const failures = setupRuntimeErrorCollector(page)

  await login(page)
  await page.screenshot({ path: testInfo.outputPath('employee-dashboard.png'), fullPage: true })

  const dashboardScrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))
  const dashboardInnerWidth = await page.evaluate(() => window.innerWidth)
  expect(dashboardScrollWidth).toBeLessThanOrEqual(dashboardInnerWidth)

  // Dashboard must have at least one held item with "Mở ra làm"
  const heldCards = page.locator('article.ew-held')
  const openButtons = heldCards.getByRole('button', { name: 'Mở ra làm' })
  const heldCount = await openButtons.count()
  if (heldCount === 0) {
    throw new Error('TEST_DATA_BLOCKED: No assigned employee item with "Mở ra làm" found on dashboard')
  }
  expect(heldCount).toBeGreaterThan(0)

  await openButtons.first().click()

  // Node detail verification
  await expect(page.locator('.eiw-node-banner, h1, h2.eiw-band--name').first()).toBeVisible({ timeout: 15_000 })

  const nodeChain = page.getByRole('list', { name: 'Các bước của hạng mục' })
  await expect(nodeChain).toBeVisible()

  const attachmentCabinet = page.locator('.eiw-attachments-card')
  await expect(attachmentCabinet).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mở tủ hồ sơ theo bước' })).toBeVisible()

  const outputArea = page.getByRole('region', { name: 'Giấy tờ đầu ra' })
  await expect(outputArea).toBeVisible()

  const footer = page.locator('footer.eiw-foot')
  await expect(footer).toBeVisible()

  const actionControl = footer.getByRole('button', { name: /Nộp nghiệm thu|Bắt đầu làm|Làm lại|Bắt đầu đo/i })
  await expect(actionControl).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('employee-node-detail.png'), fullPage: true })

  const nodeDetailScrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))
  const nodeDetailInnerWidth = await page.evaluate(() => window.innerWidth)
  expect(nodeDetailScrollWidth).toBeLessThanOrEqual(nodeDetailInnerWidth)

  // Open a real document when seeded
  const docRows = outputArea.locator('.eiw-doc')
  const totalDocRows = await docRows.count()
  if (totalDocRows === 0) {
    throw new Error('TEST_DATA_BLOCKED: No checklist output document rows found in node detail')
  }

  const seededRows = docRows.filter({ has: page.locator('.eiw-doc__filename-pill') })
  const seededCount = await seededRows.count()
  if (seededCount === 0) {
    throw new Error('TEST_DATA_BLOCKED: No seeded output document with an attached file found in node detail')
  }

  const targetDocRow = seededRows.first()
  const rowDocName = (await targetDocRow.locator('.eiw-doc__name').textContent())?.trim()
  const rowFileName = (await targetDocRow.locator('.eiw-doc__filename-pill').textContent())?.trim()

  const openDocBtn = targetDocRow.getByRole('button', { name: /Mở|Xem/i })
  await openDocBtn.click()

  // Document preview modal assertions
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  const dialogFileName = (await dialog.locator('.dpm-file-name').textContent())?.trim()
  expect(dialogFileName).toBeTruthy()
  expect(dialogFileName).toBe(rowFileName || rowDocName)

  // Assert no upload tab, no Unsplash URL, no fabricated cadastral preview, and no SHA-256 verified text
  await expect(dialog.getByRole('tab', { name: /Tải lên|Thay thế/i })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /Tải lên \/ Thay thế|Chọn file/i })).toHaveCount(0)
  await expect(dialog.getByText(/Tải lên \/ Thay thế/i)).toHaveCount(0)
  await expect(dialog.locator('img[src*="unsplash.com"]')).toHaveCount(0)
  await expect(dialog.getByAltText(/Ảnh chụp thực địa/i)).toHaveCount(0)
  await expect(dialog.getByText(/Đã chứng thực SHA-256/i)).toHaveCount(0)
  await expect(dialog.getByText(/Tọa độ VN-2000/i)).toHaveCount(0)

  // Unsupported format check vs browser preview
  const ext = dialogFileName.includes('.') ? dialogFileName.split('.').pop().toLowerCase() : ''
  const isSupportedPreviewExt = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif', 'docx'].includes(ext)

  const unsupportedNotice = dialog.getByText('Không thể xem trước định dạng này trên trình duyệt.')
  if (!isSupportedPreviewExt) {
    await expect(unsupportedNotice).toBeVisible()
    const openLink = dialog.locator('a.dpm-doc-open-link')
    await expect(openLink).toBeVisible()
    const openUrl = await openLink.getAttribute('href')
    expect(openUrl).toBeTruthy()
    expect(openUrl).toMatch(/^blob:|^https?:/)
  } else {
    const isUnsupported = await unsupportedNotice.isVisible()
    if (isUnsupported) {
      const fallbackDownload = dialog.locator('a.dpm-btn-download, a.dpm-doc-open-link').first()
      await expect(fallbackDownload).toBeVisible()
      const fallbackUrl = await fallbackDownload.getAttribute('href')
      expect(fallbackUrl).toBeTruthy()
      expect(fallbackUrl).toMatch(/^blob:|^https?:/)
    } else {
      const previewSurface = dialog.locator('.dpm-preview-iframe, .dpm-preview-img, .dpm-docx-surface')
      await expect(previewSurface).toBeVisible()
    }
  }

  // Close preview modal
  const closeButton = dialog.getByRole('button', { name: 'Đóng cửa sổ' })
  await closeButton.click()
  await expect(dialog).not.toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('employee-node-after-actions.png'), fullPage: true })

  // All runtime failures fatal
  expect(failures, failures.join('\n')).toEqual([])
})

test('employee workflow remains usable on mobile', async ({ page }, testInfo) => {
  const failures = setupRuntimeErrorCollector(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)

  // Mobile dashboard checks
  const heldSection = page.getByRole('region', { name: 'Hạng mục bạn đã nhận' })
  await expect(heldSection).toBeVisible()

  const dashboardScrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))
  const dashboardInnerWidth = await page.evaluate(() => window.innerWidth)
  expect(dashboardScrollWidth).toBeLessThanOrEqual(dashboardInnerWidth)

  const openButtons = page.locator('article.ew-held').getByRole('button', { name: 'Mở ra làm' })
  const heldCount = await openButtons.count()
  if (heldCount === 0) {
    throw new Error('TEST_DATA_BLOCKED: No assigned employee item with "Mở ra làm" found on dashboard for mobile test')
  }
  expect(heldCount).toBeGreaterThan(0)

  await openButtons.first().click()

  // Mobile node detail checks
  await expect(page.locator('.eiw-node-banner, h1, h2.eiw-band--name').first()).toBeVisible({ timeout: 15_000 })

  const nodeChain = page.getByRole('list', { name: 'Các bước của hạng mục' })
  await expect(nodeChain).toBeVisible()

  const attachmentCabinet = page.locator('.eiw-attachments-card')
  await expect(attachmentCabinet).toBeVisible()

  const outputArea = page.getByRole('region', { name: 'Giấy tờ đầu ra' })
  await expect(outputArea).toBeVisible()

  const footer = page.locator('footer.eiw-foot')
  await expect(footer).toBeVisible()

  const actionControl = footer.getByRole('button', { name: /Nộp nghiệm thu|Bắt đầu làm|Làm lại|Bắt đầu đo/i })
  await expect(actionControl).toBeVisible()

  // Assert scrollWidth <= innerWidth
  const nodeDetailScrollWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))
  const nodeDetailInnerWidth = await page.evaluate(() => window.innerWidth)
  expect(nodeDetailScrollWidth).toBeLessThanOrEqual(nodeDetailInnerWidth)

  await page.screenshot({ path: testInfo.outputPath('employee-mobile.png'), fullPage: true })

  // All runtime failures fatal
  expect(failures, failures.join('\n')).toEqual([])
})

test('employee submission gate exposes hard rejection and soft shortage', async ({ page }) => {
  const failures = setupRuntimeErrorCollector(page)

  await login(page)
  const openButtons = page.locator('article.ew-held').getByRole('button', { name: 'Mở ra làm' })
  if (await openButtons.count() === 0) {
    throw new Error('TEST_DATA_BLOCKED: No assigned employee item with "Mở ra làm" found for gate test')
  }
  const taskId = await page.evaluate(async () => {
    const token = window.localStorage.getItem('bachkhoa_access_token')
    const response = await fetch('/api/employee-portal/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json()
    return body.tasks?.find(task => task.node_code === 'K01')?.id || null
  })
  if (!taskId) {
    throw new Error('TEST_DATA_BLOCKED: Node detail does not expose task node identity for gate request')
  }
  const token = await page.evaluate(() => window.localStorage.getItem('bachkhoa_access_token'))
  await openButtons.first().click()
  await expect(page.locator('.eiw-node-banner, h1, h2.eiw-band--name').first()).toBeVisible({ timeout: 15_000 })

  const rejectionAlert = page.locator('.eiw-alert.is-rejected_documents')
  const shortageAlert = page.locator('.eiw-alert.is-missing_documents')
  await expect(rejectionAlert).toBeVisible()
  await expect(shortageAlert).toBeVisible()
  const submitResponse = await page.request.post(
    `/api/employee-portal/tasks/${encodeURIComponent(taskId)}/submit`,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { note: 'Wave 5 gate assertion' },
    },
  )
  const submitBody = await submitResponse.json().catch(() => null)
  expect(submitResponse.status()).toBe(422)
  expect(submitBody?.detail).toMatch(/chưa điền xong|trả lại|tài liệu đầu ra/i)
  expect(failures, failures.join('\n')).toEqual([])
})

test('employee upload targets the selected output document child', async ({ page }) => {
  const failures = setupRuntimeErrorCollector(page)

  await login(page)
  const openButtons = page.locator('article.ew-held').getByRole('button', { name: 'Mở ra làm' })
  if (await openButtons.count() === 0) {
    throw new Error('TEST_DATA_BLOCKED: No assigned employee item with "Mở ra làm" found for upload test')
  }
  await openButtons.first().click()
  await expect(page.locator('.eiw-node-banner, h1, h2.eiw-band--name').first()).toBeVisible({ timeout: 15_000 })

  const retryButton = page.getByRole('button', { name: 'Làm lại' })
  if (await retryButton.count() > 0) {
    const startResponse = page.waitForResponse(response =>
      response.request().method() === 'POST' && response.url().includes('/api/employee-portal/tasks/') && response.url().endsWith('/start'),
    )
    await retryButton.click()
    expect((await startResponse).status()).toBe(200)
  }

  const outputArea = page.getByRole('region', { name: 'Giấy tờ đầu ra' })
  await expect(page.getByRole('button', { name: 'Nộp nghiệm thu' })).toBeVisible()
  const targetRow = outputArea.locator('.eiw-doc').filter({ hasText: 'Giấy chứng nhận quyền sử dụng đất' })
  await expect(targetRow).toHaveCount(1)
  const uploadInput = targetRow.locator('input[type="file"]')
  await expect(uploadInput).toHaveCount(1)

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
      && request.url().includes('/api/employee-portal/tasks/')
      && request.url().includes('/output-documents'),
  )
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && response.url().includes('/api/employee-portal/tasks/')
      && response.url().includes('/output-documents'),
  )
  await uploadInput.setInputFiles({
    name: 'wave5-child-replacement.png',
    mimeType: 'image/png',
    buffer: fs.readFileSync('../backend/static/title_banner.png'),
  })
  const [request, response] = await Promise.all([requestPromise, responsePromise])
  expect(response.status()).toBe(200)
  expect(request.url()).toMatch(/\/checklist\/[^/]+\/output-documents$/)
  await expect(targetRow.locator('.eiw-doc__filename-pill')).toContainText('wave5-child-replacement.png')
  await expect(targetRow).not.toHaveClass(/is-rejected/)
  expect(failures, failures.join('\n')).toEqual([])
})
