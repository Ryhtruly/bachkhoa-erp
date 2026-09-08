import { expect, it } from 'vitest'

import { THONG_BAO_CHUA_KICH_HOAT, laLoiChuaKichHoat, loiHienThi } from './schemaV2'

it('503 hiện câu tiếng Việt, không lộ lỗi kỹ thuật', () => {
  const loi = { status: 503, message: 'Feature not migrated: column does not exist' }
  expect(laLoiChuaKichHoat(loi)).toBe(true)
  expect(loiHienThi(loi)).toBe(THONG_BAO_CHUA_KICH_HOAT)
  expect(loiHienThi(loi)).not.toMatch(/column|Internal|Error/i)
})

it('lỗi khác giữ nguyên thông điệp của máy chủ', () => {
  // Nuốt hết thành một câu chung là lấy mất manh mối của người dùng.
  const loi = { status: 409, message: 'Ô giấy này thuộc Hạng mục khác.' }
  expect(laLoiChuaKichHoat(loi)).toBe(false)
  expect(loiHienThi(loi)).toBe('Ô giấy này thuộc Hạng mục khác.')
})

it('không có thông điệp thì dùng câu mặc định của nơi gọi', () => {
  expect(loiHienThi(null, 'Không xin miễn được.')).toBe('Không xin miễn được.')
})
