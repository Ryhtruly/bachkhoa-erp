import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

// Đọc theo đường dẫn từ gốc dự án: `import.meta.url` trong môi trường test này
// không phải file:// nên fileURLToPath ném lỗi.
const css = readFileSync(
  resolve(process.cwd(), 'src/features/employee-portal/employeeWorkspace.css'), 'utf8')

// Lỗi thật đã đo trên trình duyệt ở khung 700px: trang bị kéo ngang 46px.
// Nguyên nhân: phần tử bên phải của `.eiw-top` được đặt `width: 100%` trong
// media query màn hẹp, nhưng `.eiw-top` là flex MỘT HÀNG không có flex-wrap —
// nó không hạ xuống dòng dưới được, chỉ nong rộng cả hàng ra. Đặt width:100%
// mà quên cho phép xuống dòng là làm tình hình tệ hơn chứ không phải sửa.
//
// Bố cục mới chuyển bảng tiền xuống tầng 3, phần tử bên phải của header giờ là
// nhãn ưu tiên — nên mốc canh đổi tên, còn cái bẫy thì y nguyên.
it('màn hẹp: hàng đầu workspace phải cho xuống dòng, nếu không width:100% sẽ nong rộng trang', () => {
  // File có NHIỀU khối @media (max-width: 900px). Phải quét hết rồi đòi ít nhất
  // một khối chứa cả hai luật — bắt đúng khối đầu tiên là bắt nhầm.
  const khoi = [...css.matchAll(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1])
  expect(khoi.length, 'không tìm thấy media query màn hẹp').toBeGreaterThan(0)

  const dung = khoi.some(than =>
    /\.eiw-top\s*\{[^}]*flex-wrap:\s*wrap/.test(than)
    && /\.eiw-top__flag\s*\{[^}]*width:\s*100%/.test(than))
  expect(dung, '.eiw-top thiếu flex-wrap:wrap ở màn hẹp — width:100% sẽ nong rộng trang').toBe(true)
})

it('chuỗi node được phép cuộn ngang RIÊNG, không tính là trang bị kéo ngang', () => {
  // Sơ đồ K01→K07 dài hơn màn hình là chuyện bình thường. Điều kiện là nó cuộn
  // trong hộp của chính nó, không đẩy cả trang.
  expect(css).toMatch(/\.eiw-chain\s*\{[^}]*overflow-x:\s*auto/)
})
