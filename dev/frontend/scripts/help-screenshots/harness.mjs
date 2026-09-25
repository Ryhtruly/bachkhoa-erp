// Bộ khung chụp ảnh hướng dẫn: chạy frontend thật, giả lập toàn bộ /api bằng dữ liệu mẫu
// (không cần backend, không lộ dữ liệu thật), rồi khoanh + đánh số các nút cần bấm.
import { chromium } from 'playwright'

// Ảnh hiện tên miền thật thay vì localhost: trình duyệt trỏ tên miền này về máy
// chạy vite (vite cần được phép nhận host này — xem capture.mjs).
export const PUBLIC_HOST = 'nhadatbachkhoa.com'
export const DEV_PORT = Number(process.env.HELP_DEV_PORT || 5199)
export const BASE = process.env.HELP_BASE_URL || `http://${PUBLIC_HOST}`
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export async function openApp({ user, routes, viewport = { width: 1440, height: 900 }, path = '/app', keepChat = false, loggedIn = true }) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [`--host-resolver-rules=MAP ${PUBLIC_HOST}:80 127.0.0.1:${DEV_PORT}`],
  })
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1.5, locale: 'vi-VN' })
  await context.addInitScript((withSession) => {
    if (withSession) localStorage.setItem('bachkhoa_auth_session_hint', '1')
    else localStorage.removeItem('bachkhoa_auth_session_hint')
    localStorage.setItem('bachkhoa_theme', 'light')
  }, loggedIn)
  // Ảnh QR trên giao diện lấy từ dịch vụ ngoài — trả ảnh QR mẫu cục bộ thay thế.
  await context.route('https://api.qrserver.com/**', (route) =>
    route.fulfill({ path: new URL('./sample-qr.png', import.meta.url).pathname, contentType: 'image/png' }))
  const unmatched = new Set()
  await context.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const key = `${req.method()} ${url.pathname}`
    if (url.pathname === '/api/auth/refresh') return route.fulfill({ json: { token: 'demo-token' } })
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user })
    for (const [pattern, handler] of routes) {
      const hit = typeof pattern === 'string' ? url.pathname === pattern : pattern.test(url.pathname)
      if (hit) {
        const body = typeof handler === 'function' ? handler(url, req) : handler
        return route.fulfill({ json: body })
      }
    }
    unmatched.add(key)
    return route.fulfill({ json: { data: [], items: [], total: 0 } })
  })
  const page = await context.newPage()
  // Ẩn nút chat nổi để không che nút cần chụp (trừ khi ảnh cần nó).
  if (!keepChat) {
    await context.addInitScript(() => {
      const style = document.createElement('style')
      style.textContent = 'button[aria-label="Mở trợ lý nội bộ"]{display:none!important}'
      document.addEventListener('DOMContentLoaded', () => document.head.append(style))
    })
  }
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.goto(BASE + path)
  return { browser, page, unmatched }
}

/** Khoanh viền + gắn số thứ tự lên các vùng cần chú ý. marks: [{ locator, n, label? }] */
export async function annotate(page, marks) {
  const boxes = []
  for (const mark of marks) {
    const box = await mark.locator.first().boundingBox({ timeout: 3000 }).catch(() => null)
    if (!box) { console.log('  [thiếu phần tử để khoanh]', mark.n); continue }
    boxes.push({ ...box, n: mark.n, label: mark.label || '' })
  }
  await page.evaluate((items) => {
    document.querySelectorAll('.__help-mark').forEach((el) => el.remove())
    for (const b of items) {
      const pad = 5
      const ring = document.createElement('div')
      ring.className = '__help-mark'
      Object.assign(ring.style, {
        position: 'fixed', left: `${b.x - pad}px`, top: `${b.y - pad}px`,
        width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px`,
        border: '3px solid #eb4a23', borderRadius: '10px', zIndex: 2147483646,
        boxShadow: '0 0 0 4px rgba(235,74,35,.18)', pointerEvents: 'none',
      })
      const badge = document.createElement('div')
      badge.className = '__help-mark'
      badge.textContent = String(b.n)
      const left = Math.max(4, b.x - pad - 14)
      const top = Math.max(4, b.y - pad - 14)
      Object.assign(badge.style, {
        position: 'fixed', left: `${left}px`, top: `${top}px`, width: '28px', height: '28px',
        borderRadius: '50%', background: '#eb4a23', color: '#fff', font: '700 15px/28px system-ui, sans-serif',
        textAlign: 'center', zIndex: 2147483647, boxShadow: '0 2px 6px rgba(0,0,0,.3)', pointerEvents: 'none',
      })
      document.body.append(ring, badge)
    }
  }, boxes)
}

export async function clearMarks(page) {
  await page.evaluate(() => document.querySelectorAll('.__help-mark').forEach((el) => el.remove()))
}

/** Chụp một vùng (clip) hoặc cả khung nhìn. */
export async function shoot(page, file, clip) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: new URL(`../../public/help/${file}`, import.meta.url).pathname, clip, animations: 'disabled' })
  console.log('  ✓', file)
}
