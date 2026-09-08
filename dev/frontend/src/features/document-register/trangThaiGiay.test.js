import { expect, it } from 'vitest'

import { trangThaiGiay } from './DocumentRegister'

const slot = (ghiDe = {}) => ({
  is_required: true, file_count: 0, quantity: 1,
  is_waived: false, waiver_pending: false, ...ghiDe,
})

it('ô bắt buộc chưa có tệp là Thiếu', () => {
  expect(trangThaiGiay(slot()).nhan).toBe('Thiếu')
})

it('đủ số lượng là Đã đủ', () => {
  expect(trangThaiGiay(slot({ file_count: 2, quantity: 2 })).nhan).toBe('Đã đủ')
})

it('chưa đủ số lượng vẫn là Thiếu', () => {
  // 1/2 tệp chưa phải là đủ — đếm theo quantity chứ không phải "có tệp nào chưa".
  const tt = trangThaiGiay(slot({ file_count: 1, quantity: 2 }))
  expect(tt.nhan).toBe('Thiếu')
  expect(tt.title).toMatch(/1\/2/)
})

it('TÀI LIỆU THẬT thắng quyết định miễn', () => {
  // Miễn là để gỡ bế tắc khi thiếu giấy, không phải để xoá công sức của người
  // cuối cùng vẫn đi lấy được nó.
  const tt = trangThaiGiay(slot({ file_count: 1, is_waived: true }))
  expect(tt.nhan).toBe('Đã đủ')
  expect(tt.phu).toBe('Từng được miễn')
})

it('miễn chỉ hiện khi CHƯA đủ file', () => {
  expect(trangThaiGiay(slot({ is_waived: true })).nhan).toBe('Đã được miễn')
})

it('đang xin miễn đứng trên Thiếu nhưng dưới Đã được miễn', () => {
  expect(trangThaiGiay(slot({ waiver_pending: true })).nhan).toBe('Đang xin miễn')
  expect(trangThaiGiay(slot({ waiver_pending: true, is_waived: true })).nhan).toBe('Đã được miễn')
})

it('ô không bắt buộc mà trống thì không bị gọi là Thiếu', () => {
  expect(trangThaiGiay(slot({ is_required: false })).nhan).toBe('Chưa có')
})
