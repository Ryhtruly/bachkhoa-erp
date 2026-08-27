import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

const doc = (duongDan) => readFileSync(fileURLToPath(new URL(duongDan, import.meta.url)), 'utf8')

const layZIndex = (css, boChon) => {
  const khoi = new RegExp(`${boChon.replace('.', '\\.')}\\s*\\{[^}]*?z-index:\\s*(\\d+)`, 's')
  const khop = css.match(khoi)
  return khop ? Number(khop[1]) : null
}

// Hộp "Xem tài liệu" luôn được mở TỪ BÊN TRONG form soạn hợp đồng. Cả hai đều là
// portal ra document.body, nên thứ tự chỉ do z-index quyết định. Lớp phủ modal
// chung chỉ có z-index 100: nếu không nâng riêng, hộp xem tài liệu nằm DƯỚI form
// — bấm vào tên tệp không thấy gì hiện ra, mà Modal vẫn khoá cuộn body và không
// bấm tới được để đóng, đúng cảm giác màn hình bị đơ.
it('hộp xem tài liệu phải nổi trên form soạn hợp đồng', () => {
  const xemTaiLieu = layZIndex(doc('./filePreviewModal.css'), '.file-preview-overlay')
  const soanHopDong = layZIndex(doc('../../features/contracts/contractComposer.css'), '.ctr-form-overlay')

  expect(xemTaiLieu).not.toBeNull()
  expect(soanHopDong).not.toBeNull()
  expect(xemTaiLieu).toBeGreaterThan(soanHopDong)
})

// Toast báo lỗi/thành công phải nằm trên tất cả, kể cả hộp xem tài liệu — nếu
// không thì thông báo "tải tệp thất bại" bị chính hộp xem tệp che mất.
it('toast vẫn nổi trên hộp xem tài liệu', () => {
  const xemTaiLieu = layZIndex(doc('./filePreviewModal.css'), '.file-preview-overlay')
  const toast = layZIndex(doc('../../index.css'), '.toast-container')

  expect(toast).toBeGreaterThan(xemTaiLieu)
})
