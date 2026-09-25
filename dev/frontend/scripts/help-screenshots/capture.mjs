// Chụp ảnh minh hoạ cho Hướng dẫn sử dụng → public/help/*.png
//
// Cách chạy (không cần backend — API được giả lập bằng fixtures.mjs):
//   __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=nhadatbachkhoa.com npx vite --port 5199 --strictPort &
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

async function passwordShots() {
  console.log('• Mật khẩu')
  const authRoutes = [
    ['/api/auth/forgot-password/request-otp', { email_masked: 'ng***@gmail.com' }],
    ['/api/auth/forgot-password/verify-otp', { valid: true }],
    [/\/api\/auth\/invite\/[^/]+$/, { username: 'nva', employee_name: 'Nguyễn Văn An' }],
  ]
  // Màn đăng nhập + quên mật khẩu (chưa đăng nhập)
  let { browser, page } = await openApp({ user: F.DIRECTOR_USER, routes: authRoutes, loggedIn: false, path: '/' })
  const form = page.locator('form').first()
  await page.locator('#u').waitFor()
  await page.locator('#u').fill('nva')
  await page.locator('#p').fill('matkhau')
  await page.waitForTimeout(500)
  await annotate(page, [
    { locator: page.locator('#u'), n: 1 },
    { locator: page.locator('#p'), n: 2 },
    { locator: page.getByRole('button', { name: /Truy cập hệ thống/ }), n: 3 },
    { locator: page.getByText('Quên mật khẩu?'), n: 4 },
  ])
  await shoot(page, 'mat-khau-dang-nhap.png', await regionOf(form, 28, page))
  await clearMarks(page)

  await page.getByText('Quên mật khẩu?').click()
  const idInput = page.getByPlaceholder('Ví dụ: admin hoặc user@gmail.com')
  await idInput.fill('nva')
  await annotate(page, [
    { locator: idInput, n: 1 },
    { locator: page.getByRole('button', { name: /Gửi mã OTP qua Email/ }), n: 2 },
  ])
  await shoot(page, 'mat-khau-quen-1.png', await regionOf(page.locator('form').first(), 28, page))
  await clearMarks(page)

  await page.getByRole('button', { name: /Gửi mã OTP qua Email/ }).click()
  await page.getByText('Mã OTP (6 chữ số)').waitFor()
  const otpInput = page.locator('#otp-input')
  await otpInput.fill('482913')
  await annotate(page, [
    { locator: otpInput, n: 1 },
    { locator: page.getByRole('button', { name: /Tiếp tục đặt mật khẩu/ }), n: 2 },
    { locator: page.getByRole('button', { name: /Gửi lại/ }), n: 3 },
  ])
  await shoot(page, 'mat-khau-quen-2.png', await regionOf(page.locator('form').first(), 28, page))
  await clearMarks(page)

  await page.getByRole('button', { name: /Tiếp tục đặt mật khẩu/ }).click()
  await page.getByPlaceholder('Nhập lại mật khẩu mới').waitFor()
  await page.getByPlaceholder('Tối thiểu 6 ký tự').fill('BachKhoa@2026')
  await page.getByPlaceholder('Nhập lại mật khẩu mới').fill('BachKhoa@2026')
  await annotate(page, [
    { locator: page.getByPlaceholder('Tối thiểu 6 ký tự'), n: 1 },
    { locator: page.getByPlaceholder('Nhập lại mật khẩu mới'), n: 2 },
    { locator: page.getByRole('button', { name: /Cập nhật & Đăng nhập/ }), n: 3 },
  ])
  await shoot(page, 'mat-khau-quen-3.png', await regionOf(page.locator('form').first(), 28, page))
  await browser.close()

  // Trang kích hoạt tài khoản từ email mời
  ;({ browser, page } = await openApp({ user: F.DIRECTOR_USER, routes: authRoutes, loggedIn: false, path: '/set-password?token=demo-invite' }))
  await page.getByPlaceholder('Nhập mật khẩu mới...').waitFor()
  await page.getByPlaceholder('Nhập mật khẩu mới...').fill('BachKhoa@2026')
  await page.getByPlaceholder('Nhập lại mật khẩu mới...').fill('BachKhoa@2026')
  await page.waitForTimeout(300)
  await annotate(page, [
    { locator: page.getByText('TÀI KHOẢN KÍCH HOẠT:').locator('xpath=..'), n: 1 },
    { locator: page.getByPlaceholder('Nhập mật khẩu mới...'), n: 2 },
    { locator: page.getByPlaceholder('Nhập lại mật khẩu mới...'), n: 3 },
    { locator: page.getByRole('button', { name: /LƯU MẬT KHẨU & ĐĂNG NHẬP/ }), n: 4 },
  ])
  await shoot(page, 'mat-khau-kich-hoat.png', { x: 1000, y: 56, width: 440, height: 640 })
  await browser.close()

  // Đổi mật khẩu khi đang đăng nhập
  ;({ browser, page } = await openApp({ user: F.EMPLOYEE_USER, routes: EMPLOYEE_ROUTES }))
  await page.getByText('Tải của bạn').waitFor()
  await page.locator('.header-user-menu__trigger').click()
  await annotate(page, [{ locator: page.getByRole('menuitem', { name: /Đổi mật khẩu/ }).or(page.getByRole('button', { name: /Đổi mật khẩu/ })), n: 1 }])
  await shoot(page, 'mat-khau-doi-1.png', { x: 1040, y: 0, width: 400, height: 420 })
  await clearMarks(page)
  await page.getByRole('menuitem', { name: /Đổi mật khẩu/ }).or(page.getByRole('button', { name: /Đổi mật khẩu/ })).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Nhập mật khẩu đang sử dụng').fill('matkhaucu')
  await dialog.getByPlaceholder('Tối thiểu 6 ký tự').fill('BachKhoa@2026')
  await dialog.getByPlaceholder('Nhập lại mật khẩu mới').fill('BachKhoa@2026')
  await annotate(page, [
    { locator: dialog.getByPlaceholder('Nhập mật khẩu đang sử dụng'), n: 2 },
    { locator: dialog.getByPlaceholder('Tối thiểu 6 ký tự'), n: 3 },
    { locator: dialog.getByPlaceholder('Nhập lại mật khẩu mới'), n: 4 },
    { locator: dialog.getByRole('button', { name: /^Đổi mật khẩu$/ }), n: 5 },
  ])
  await shoot(page, 'mat-khau-doi-2.png', await regionOf(dialog.locator('.modal'), 16, page))
  await browser.close()
}

async function saleShots() {
  console.log('• Quy trình Sale')
  const routes = [
    ...MANAGEMENT_ROUTES,
    [/\/api\/customers\/loyalty-eligibility$/, F.LOYALTY_ELIGIBLE],
    ['/api/intake/lead', F.INTAKE_SUCCESS],
  ]
  let { browser, page } = await openApp({ user: F.DIRECTOR_USER, routes })
  await page.getByRole('button', { name: 'CRM Bán Hàng' }).click()
  await page.getByText('Võ Minh Tâm').waitFor()

  // 1) Tạo mã QR theo đúng dịch vụ
  await page.getByRole('button', { name: /Mã QR Form/ }).click()
  const qrDialog = page.getByRole('dialog')
  await qrDialog.getByText('Tải Ảnh QR').waitFor()
  const qrSelects = qrDialog.locator('select')
  await qrSelects.nth(0).selectOption({ label: 'Đo Vẽ' }).catch(() => qrSelects.nth(0).selectOption({ index: 1 }))
  await page.waitForTimeout(300)
  await qrSelects.nth(1).selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(800)
  await annotate(page, [
    { locator: qrSelects.nth(0), n: 1 },
    { locator: qrSelects.nth(1), n: 2 },
    { locator: qrDialog.locator('img').first(), n: 3 },
    { locator: qrDialog.getByRole('button', { name: /Sao chép/ }), n: 4 },
    { locator: qrDialog.getByText(/Tải Ảnh QR/), n: 5 },
  ])
  await shoot(page, 'sale-qr.png', await regionOf(qrDialog.locator('.modal'), 16, page))
  await clearMarks(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 4) Chốt deal
  await page.locator('.lead-card').filter({ hasText: 'Võ Minh Tâm' }).locator('select').selectOption('Chốt')
  const closeDialog = page.getByRole('dialog')
  await closeDialog.getByText(/Khách hàng ưu tiên|Tự động áp dụng/).first().waitFor({ timeout: 4000 }).catch(() => {})
  await closeDialog.getByPlaceholder(/15000000/).fill('18500000')
  await closeDialog.getByPlaceholder(/mã số thuế hoặc số CCCD/).fill('079090012345')
  await page.waitForTimeout(400)
  await annotate(page, [
    { locator: closeDialog.getByText(/Tự động áp dụng/).first(), n: 1 },
    { locator: closeDialog.getByPlaceholder(/15000000/), n: 2 },
    { locator: closeDialog.getByPlaceholder(/250 m2|mốc ranh/), n: 3 },
    { locator: closeDialog.getByPlaceholder(/mã số thuế hoặc số CCCD/), n: 4 },
    { locator: closeDialog.getByRole('button', { name: /Chốt Deal & Sinh Hợp Đồng/ }), n: 5 },
  ])
  await shoot(page, 'sale-chot.png', await regionOf(closeDialog.locator('.modal'), 16, page))
  await browser.close()

  // 2-3) Khách mở form bằng QR / link
  ;({ browser, page } = await openApp({ user: F.DIRECTOR_USER, routes, loggedIn: false, path: '/yeu-cau-dich-vu', viewport: { width: 1100, height: 900 } }))
  await page.getByText('Bạn cần hỗ trợ dịch vụ gì?').waitFor()
  await page.getByRole('button', { name: 'Kiểm tra hiện trạng' }).click()
  await page.getByPlaceholder(/150 m²|300 m²|m²/).first().fill('120 m²')
  await page.getByPlaceholder(/Thửa 124/).fill('Thửa 56, Tờ 12, P. Tân Phong, Quận 7')
  await page.getByPlaceholder(/Nguyễn Văn An/).fill('Nguyễn Văn Bình')
  await page.getByPlaceholder(/0912345678/).fill('0908765432')
  await page.evaluate(() => window.scrollTo(0, 0))
  await annotate(page, [
    { locator: page.getByText('Đo Vẽ', { exact: true }).locator('xpath=ancestor::button[1]'), n: 1 },
    { locator: page.getByText(/Hạng mục chi tiết thuộc gói/i).locator('xpath=..'), n: 2 },
  ])
  await shoot(page, 'sale-form-1.png')
  await clearMarks(page)
  await page.getByPlaceholder(/Thửa 124/).scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 120))
  await page.waitForTimeout(300)
  await annotate(page, [
    { locator: page.getByPlaceholder(/150 m²|300 m²|m²/).first(), n: 3 },
    { locator: page.getByPlaceholder(/Thửa 124/), n: 4 },
    { locator: page.getByPlaceholder(/Nguyễn Văn An/), n: 5 },
    { locator: page.getByPlaceholder(/0912345678/), n: 6 },
    { locator: page.getByRole('button', { name: /Gửi Yêu Cầu Khảo Sát/ }), n: 7 },
  ])
  await shoot(page, 'sale-form-2.png')
  await clearMarks(page)
  await page.getByRole('button', { name: /Gửi Yêu Cầu Khảo Sát/ }).click()
  await page.getByText('Đã Tiếp Nhận Thành Công!').waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await shoot(page, 'sale-form-xong.png')
  await browser.close()
}

async function rollbackShots() {
  console.log('• Quay ngược bước')
  const legalRoutes = [
    ['/api/employee-portal/me', F.LEGAL_ME],
    ['/api/employee-portal/task-pool', F.LEGAL_POOL],
    ['/api/employee-portal/daily-summary', F.DAILY_SUMMARY],
    ['/api/employee-portal/completed-items', { count: 0, items: [] }],
    [/\/shortage$/, { blockers: [] }],
    [/\/source-documents$/, { data: [] }],
    [/\/rollback-preview$/, F.ROLLBACK_PREVIEW],
    [/\/api\/legal-submissions\/by-task-node\//, { data: null }],
  ]
  let { browser, page } = await openApp({ user: F.LEGAL_USER, routes: legalRoutes })
  await page.getByRole('button', { name: 'Mở ra làm' }).click()
  const pauseBtn = page.getByRole('button', { name: /Tạm dừng/ }).first()
  await pauseBtn.waitFor()
  await page.waitForTimeout(600)
  await annotate(page, [{ locator: pauseBtn, n: 1 }])
  await shoot(page, 'quay-lai-1-tam-dung.png', { x: 250, y: 55, width: 1190, height: 845 })
  await clearMarks(page)

  await pauseBtn.click()
  const pauseDialog = page.getByRole('dialog')
  await pauseDialog.getByText('Chờ đo vẽ sửa').click()
  await pauseDialog.locator('textarea').fill('Một cửa trả hồ sơ vì bản vẽ sai ranh mốc số 4.')
  await annotate(page, [
    { locator: pauseDialog.getByText('Chờ đo vẽ sửa').locator('xpath=ancestor::label[1]'), n: 2 },
    { locator: pauseDialog.locator('textarea'), n: 3 },
    { locator: pauseDialog.getByRole('button', { name: /Tiếp tục chọn bước/ }), n: 4 },
  ])
  await shoot(page, 'quay-lai-2-ly-do.png', await regionOf(pauseDialog.locator('.modal'), 16, page))
  await clearMarks(page)

  await pauseDialog.getByRole('button', { name: /Tiếp tục chọn bước/ }).click()
  const picker = page.getByRole('dialog', { name: /Chọn bước để quay lại/ })
  await picker.waitFor()
  await picker.getByRole('button', { name: /K03/ }).click()
  await picker.getByText('sẽ phải làm lại').first().waitFor().catch(() => {})
  await picker.locator('textarea').fill('Bản vẽ sai ranh mốc số 4 giáp đường, diện tích lệch 2,3 m² so với sổ.')
  await page.waitForTimeout(500)
  await annotate(page, [
    { locator: picker.getByRole('button', { name: /K03/ }), n: 5 },
    { locator: picker.getByText('sẽ phải làm lại').first().locator('xpath=ancestor::button[1]'), n: 6 },
    { locator: picker.locator('textarea'), n: 7 },
    { locator: picker.getByRole('button', { name: /Gửi yêu cầu/ }), n: 8 },
  ])
  await shoot(page, 'quay-lai-3-chon-buoc.png', await regionOf(picker.locator('.modal').or(picker).first(), 12, page))
  await browser.close()

  // Giám đốc duyệt
  ;({ browser, page } = await openApp({ user: F.DIRECTOR_USER, routes: [
    ['/api/contracts/workflow/rollback-requests', F.ROLLBACK_REQUESTS],
    ['/api/document-register/change-requests', { data: [] }],
    ['/api/slot-requests', { data: [] }],
  ] }))
  await page.getByRole('button', { name: 'Hàng Chờ Duyệt' }).click()
  const card = page.locator('.aq-card.is-rollback')
  await card.waitFor()
  await page.waitForTimeout(400)
  await annotate(page, [
    { locator: card.locator('.aq-card__target'), n: 1 },
    { locator: card.locator('blockquote'), n: 2 },
    { locator: card.getByRole('button', { name: 'Từ chối' }), n: 3 },
    { locator: card.getByRole('button', { name: /Duyệt & trả về/ }), n: 4 },
  ])
  await shoot(page, 'quay-lai-4-duyet.png', await regionOf(card.locator('xpath=..'), 16, page))
  await browser.close()
}

const only = process.argv[2]
if (!only || only === 'employee') await employeeShots()
if (!only || only === 'crm') await crmShots()
if (!only || only === 'contract') await contractShots()
if (!only || only === 'password') await passwordShots()
if (!only || only === 'sale') await saleShots()
if (!only || only === 'rollback') await rollbackShots()
