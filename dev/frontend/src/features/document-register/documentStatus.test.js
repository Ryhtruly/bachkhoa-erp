import { expect, it } from 'vitest'

import { documentSlotStatus, trangThaiGiay } from './DocumentRegister'

const mockSlot = (overrides = {}) => ({
  is_required: true, file_count: 0, quantity: 1,
  is_waived: false, waiver_pending: false, ...overrides,
})

it('ô bắt buộc chưa có tệp là Thiếu', () => {
  expect(documentSlotStatus(mockSlot()).label).toBe('Thiếu')
  expect(trangThaiGiay(mockSlot()).nhan).toBe('Thiếu')
})

it('đủ số lượng là Đã đủ', () => {
  expect(documentSlotStatus(mockSlot({ file_count: 2, quantity: 2 })).label).toBe('Đã đủ')
})

it('chưa đủ số lượng vẫn là Thiếu', () => {
  const status = documentSlotStatus(mockSlot({ file_count: 1, quantity: 2 }))
  expect(status.label).toBe('Thiếu')
  expect(status.title).toMatch(/1\/2/)
})

it('TÀI LIỆU THẬT thắng quyết định miễn', () => {
  const status = documentSlotStatus(mockSlot({ file_count: 1, is_waived: true }))
  expect(status.label).toBe('Đã đủ')
  expect(status.subtitle).toBe('Từng được miễn')
})

it('miễn chỉ hiện khi CHƯA đủ file', () => {
  expect(documentSlotStatus(mockSlot({ is_waived: true })).label).toBe('Đã được miễn')
})

it('đang xin miễn đứng trên Thiếu nhưng dưới Đã được miễn', () => {
  expect(documentSlotStatus(mockSlot({ waiver_pending: true })).label).toBe('Đang xin miễn')
  expect(documentSlotStatus(mockSlot({ waiver_pending: true, is_waived: true })).label).toBe('Đã được miễn')
})

it('ô không bắt buộc mà trống thì không bị gọi là Thiếu', () => {
  expect(documentSlotStatus(mockSlot({ is_required: false })).label).toBe('Chưa có')
})
