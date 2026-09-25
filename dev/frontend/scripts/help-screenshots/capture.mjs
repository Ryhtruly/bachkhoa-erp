// Chụp ảnh minh hoạ cho Hướng dẫn sử dụng → public/help/*.png
//
// Cách chạy (không cần backend — API được giả lập bằng fixtures.mjs):
//   npx vite --port 5199 --strictPort &
//   node scripts/help-screenshots/capture.mjs
//
// Giao diện đổi thì chạy lại để ảnh luôn khớp với bản đang dùng.
import { annotate, clearMarks, openApp, shoot } from './harness.mjs'
import * as F from './fixtures.mjs'

/** Khung bao quanh một phần tử (toạ độ khung nhìn), nới thêm lề. */
async function regionOf(locator, pad = 12, page) {
  await locator.first().scrollIntoViewIfNeeded()
  const box = await locator.first().boundingBox()
  const vw = page.viewportSize()
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  return {
    x, y,
    width: Math.min(vw.width - x, box.width + pad * 2),
    height: Math.min(vw.height - y, box.height + pad * 2),
  }
}

const EMPLOYEE_ROUTES = [
  ['/api/employee-portal/me', F.EMPLOYEE_ME],
  ['/api/employee-portal/task-pool', F.TASK_POOL],
  ['/api/employee-portal/daily-summary', F.DAILY_SUMMARY],
  ['/api/employee-portal/completed-items', { count: 0, items: [] }],
  [/\/shortage$/, { blockers: [] }],
  [/\/source-documents$/, { data: [] }],
]

const MANAGEMENT_ROUTES = [
  [/\/api\/crm\/leads$/, { status: 'success', data: F.CRM_LEADS }],
  [/\/api\/crm\/stats$/, { status: 'success', data: F.CRM_STATS }],
  [/\/api\/crm\/settings$/, { status: 'success', data: F.CRM_POLICY }],
  [/\/api\/intake\/services$/, F.INTAKE_SERVICES],
  ...F.CONTRACT_ROUTES,
]

async function employeeShots() {
  console.log('• Bể việc & nộp nghiệm thu')
  const { browser, page } = await openApp({ user: F.EMPLOYEE_USER, routes: EMPLOYEE_ROUTES })
  await page.getByText('Tải của bạn').waitFor()
  await page.waitForTimeout(800)

  // 1) Thanh tải
  const loadBar = page.locator('.ew-load').first()
  await annotate(page, [{ locator: loadBar, n: 1 }])
  await page.evaluate(() => window.scrollTo(0, 0))
  await shoot(page, 'be-viec-tai.png', await regionOf(loadBar, 14, page))
  await clearMarks(page)

  // 2) Hạng mục đã nhận
  const heldSection = page.getByRole('heading', { name: 'Hạng mục bạn đã nhận' }).locator('xpath=ancestor::section[1]')
  await heldSection.scrollIntoViewIfNeeded()
  await annotate(page, [
    { locator: page.getByRole('button', { name: 'Mở ra làm' }), n: 1 },
    { locator: page.getByRole('button', { name: 'Nhờ hỗ trợ' }), n: 2 },
  ])
  await shoot(page, 'be-viec-hang-muc.png', await regionOf(heldSection, 8, page))
  await clearMarks(page)

  // 3) Bể việc
  const poolHeading = page.getByText('Bể việc phòng Đo vẽ')
  const poolSection = poolHeading.locator('xpath=ancestor::section[1]')
  await poolSection.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await annotate(page, [
    { locator: page.getByRole('tablist', { name: 'Nhóm việc trong bể việc' }), n: 1 },
    { locator: poolSection.getByRole('button', { name: 'Chi tiết' }), n: 2 },
    { locator: poolSection.getByRole('button', { name: /Nhận trọn/ }), n: 3 },
  ])
  await shoot(page, 'be-viec-be.png', await regionOf(poolSection, 8, page))
  await clearMarks(page)

  // 4) Màn làm việc của một bước
  await page.getByRole('button', { name: 'Mở ra làm' }).click()
  await page.getByText('Danh sách checklist').waitFor()
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  await annotate(page, [
    { locator: page.getByRole('list', { name: /Các bước của hạng mục/ }), n: 1 },
    { locator: page.getByRole('button', { name: /Bắt đầu đo hiện trường|Bắt đầu làm/ }), n: 2 },
    { locator: page.getByRole('button', { name: /Chọn file minh chứng/ }), n: 3 },
    { locator: page.getByRole('button', { name: /Mở tủ hồ sơ theo bước/ }), n: 4 },
    { locator: page.getByRole('button', { name: 'Nhờ hỗ trợ' }), n: 5 },
  ])
  await shoot(page, 'lam-buoc.png', { x: 250, y: 55, width: 1190, height: 845 })
  await browser.close()
}

async function crmShots() {
  console.log('• CRM')
  const { browser, page } = await openApp({ user: F.DIRECTOR_USER, routes: MANAGEMENT_ROUTES })
  await page.getByRole('button', { name: 'CRM Bán Hàng' }).click()
  await page.getByText('Nguyễn Văn Khánh').waitFor()
  await page.waitForTimeout(600)

  await annotate(page, [
    { locator: page.getByRole('button', { name: /Tạo Lead Mới/ }), n: 1 },
    { locator: page.getByRole('button', { name: /Nhận lead này/ }), n: 2 },
    { locator: page.locator('.crm-card, [class*="lead-card"]').filter({ hasText: 'Võ Minh Tâm' }).locator('select, [role="combobox"]'), n: 3 },
    { locator: page.getByRole('button', { name: /Mã QR Form/ }), n: 4 },
    { locator: page.getByRole('button', { name: /Copy Link Form Zalo/ }), n: 5 },
  ])
  await shoot(page, 'crm-tong-quan.png', { x: 250, y: 55, width: 1190, height: 700 })
  await clearMarks(page)

  // Tạo lead mới
  await page.getByRole('button', { name: /Tạo Lead Mới/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByPlaceholder(/Anh Minh/).fill('Nguyễn Văn Bình')
  await dialog.getByPlaceholder(/09|Số điện thoại/).first().fill('0908 765 432')
  await dialog.getByPlaceholder(/Dịch vụ: Đo hiện trạng/).fill('Dịch vụ: Đo hiện trạng | Vị trí: Quận 7 | Quy mô: 120m2')
  await annotate(page, [
    { locator: dialog.getByPlaceholder(/Anh Minh/), n: 1 },
    { locator: dialog.getByPlaceholder(/09|Số điện thoại/).first(), n: 2 },
    { locator: dialog.getByRole('combobox').first(), n: 3 },
    { locator: dialog.getByPlaceholder(/Dịch vụ: Đo hiện trạng/), n: 4 },
    { locator: dialog.getByRole('button', { name: /Tạo Mới & Đưa vào Pipeline/ }), n: 5 },
  ])
  await shoot(page, 'crm-tao-lead.png', await regionOf(dialog.locator('.modal'), 16, page))
  await browser.close()
}

async function contractShots() {
  console.log('• Hợp đồng')
  const { browser, page } = await openApp({ user: F.DIRECTOR_USER, routes: MANAGEMENT_ROUTES })
  await page.getByRole('button', { name: 'Hợp Đồng' }).click()
  await page.getByText('Đặng Thu Hà').first().waitFor()
  await page.waitForTimeout(600)

  await annotate(page, [
    { locator: page.locator('.contract-add-button'), n: 1 },
    { locator: page.getByPlaceholder(/Tìm mã hợp đồng/), n: 2 },
    { locator: page.getByRole('row').filter({ hasText: '017/BK-2026' }), n: 3 },
    { locator: page.getByRole('button', { name: /^Quy trình$/ }), n: 4 },
    { locator: page.getByRole('button', { name: /Hủy hợp đồng/ }), n: 5 },
  ])
  await shoot(page, 'hop-dong-danh-sach.png', { x: 250, y: 55, width: 1190, height: 845 })
  await clearMarks(page)

  await page.locator('.contract-add-button').click()
  const dialog = page.getByRole('dialog', { name: 'Soạn hợp đồng mới' })
  await dialog.waitFor()
  await dialog.getByPlaceholder('Nguyễn Văn An').fill('Nguyễn Văn Bình')
  await dialog.getByPlaceholder('0901 234 567').fill('0908 765 432')
  await dialog.getByPlaceholder('079300012345').fill('079090012345')
  await page.waitForTimeout(400)
  await annotate(page, [
    { locator: dialog.getByPlaceholder('Nguyễn Văn An'), n: 1 },
    { locator: dialog.getByText('Tài liệu khách gửi').locator('xpath=ancestor::*[self::label or self::button or self::div][1]'), n: 2 },
    { locator: dialog.getByText('Tỉnh / Thành phố').locator('xpath=following::*[@role="combobox" or self::button][1]'), n: 3 },
    { locator: dialog.getByText('Gói dịch vụ', { exact: false }).locator('xpath=following::*[@role="combobox" or self::button][1]'), n: 4 },
  ])
  await shoot(page, 'hop-dong-soan-1.png', await regionOf(dialog, 0, page))
  await clearMarks(page)

  // Nửa dưới của form
  const valueInput = dialog.getByText('Giá trị hợp đồng').first().locator('xpath=following::input[1]')
  await dialog.getByText('Sale / nguồn').locator('xpath=following::input[1]').fill('Trần Minh')
  await valueInput.fill('18.5tr')
  await valueInput.blur()
  await dialog.getByText('Giấy tờ cần thu của khách').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await annotate(page, [
    { locator: dialog.getByText('Dùng bộ mặc định').locator('xpath=ancestor::*[self::button or self::label][1]'), n: 5 },
    { locator: valueInput, n: 6 },
  ])
  await shoot(page, 'hop-dong-soan-2.png', await regionOf(dialog, 0, page))
  await clearMarks(page)

  await dialog.getByText('Hạn hoàn thành').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await annotate(page, [
    { locator: dialog.getByText('Độ ưu tiên hồ sơ').locator('xpath=following::*[@role="combobox" or self::button or self::select][1]'), n: 7 },
    { locator: dialog.getByText('Hạn hoàn thành').locator('xpath=ancestor::*[.//text()[contains(., "Ngày ký")]][1]'), n: 8 },
    { locator: dialog.getByRole('button', { name: /Lưu hợp đồng/ }), n: 9 },
  ])
  await shoot(page, 'hop-dong-soan-3.png', await regionOf(dialog, 0, page))
  await browser.close()
}

const only = process.argv[2]
if (!only || only === 'employee') await employeeShots()
if (!only || only === 'crm') await crmShots()
if (!only || only === 'contract') await contractShots()
