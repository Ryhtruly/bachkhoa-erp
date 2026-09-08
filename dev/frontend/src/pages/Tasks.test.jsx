import { describe, expect, it } from 'vitest'
import { isDossierLocked } from '../lib/dossierStatus'

describe('isDossierLocked — một quy tắc khoá dùng chung cho cả 2 phân hệ', () => {
  it('tin cờ is_locked của backend, không tự đoán theo chuỗi trạng thái', () => {
    // Backend là nơi duy nhất quyết định. Kể cả trạng thái nhìn như đang chạy,
    // nếu backend bảo khoá thì khoá.
    expect(isDossierLocked({ status: 'Đang thực hiện', is_locked: true })).toBe(true)
    expect(isDossierLocked({ status: 'Hoàn thành', is_locked: false })).toBe(false)
  })

  it('hồ sơ đo vẽ đã hoàn tất thì khoá', () => {
    expect(isDossierLocked({ status: 'Hoàn thành', is_locked: true })).toBe(true)
    expect(isDossierLocked({ status: 'Nộp thành công', is_locked: true })).toBe(true)
  })

  it('hồ sơ đang chạy thì không khoá', () => {
    expect(isDossierLocked({ status: 'Đang thực hiện', is_locked: false })).toBe(false)
    expect(isDossierLocked({ status: 'Đã bàn giao', is_locked: false })).toBe(false)
  })

  it('thiếu cờ thì suy ra theo trạng thái — và ĐO VẼ với PHÁP LÝ dùng CÙNG một danh sách', () => {
    // Đây là lỗi cũ: hai phân hệ có hai danh sách khác nhau nên cùng một hồ sơ
    // bên này khoá, bên kia vẫn cho sửa.
    for (const status of ['Hoàn thành', 'Nộp thành công', 'Huỷ', 'CLOSED']) {
      expect(isDossierLocked({ status })).toBe(true)
      expect(isDossierLocked({ gov_status: status })).toBe(true)
    }
    expect(isDossierLocked({ status: 'Đang thực hiện' })).toBe(false)
    expect(isDossierLocked({ gov_status: 'Đang chi nhánh' })).toBe(false)
  })

  it('"Huỷ" cũng phải khoá — trước đây bên đo vẽ bỏ sót giá trị này', () => {
    expect(isDossierLocked({ status: 'Huỷ' })).toBe(true)
  })

  it('nhận trạng thái truyền riêng khi bản ghi chưa tải xong', () => {
    expect(isDossierLocked(null, 'Hoàn thành')).toBe(true)
    expect(isDossierLocked(null, 'Đang thực hiện')).toBe(false)
    expect(isDossierLocked(undefined)).toBe(false)
  })
})
