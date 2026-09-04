import { describe, expect, it } from 'vitest'

import {
  countdown,
  documentCounter,
  effectiveDeadline,
  formatMoney,
  mergeDocumentVerdicts,
} from './nodeWorkFormat'

const MOC = new Date('2026-09-10T08:00:00Z').getTime()
const sau = (gio) => new Date(MOC + gio * 3_600_000).toISOString()

describe('Đồng hồ đếm ngược', () => {
  it('đếm theo tháng / ngày / giờ / phút chứ không quy hết về giờ', () => {
    expect(countdown(sau(24 * 45), { now: MOC }).text).toBe('Còn 1 tháng 15 ngày')
    expect(countdown(sau(30), { now: MOC }).text).toBe('Còn 1 ngày 6 giờ')
  })

  it('còn dưới một ngày thì cảnh báo, quá hạn thì nói rõ quá hạn', () => {
    expect(countdown(sau(3), { now: MOC }).tone).toBe('urgent')
    const tre = countdown(sau(-5), { now: MOC })
    expect(tre.tone).toBe('overdue')
    expect(tre.text).toMatch(/^Quá hạn/)
  })

  it('chưa đặt hạn thì nói chưa đặt, không hiện số 0 gây hiểu nhầm', () => {
    expect(countdown(null, { now: MOC })).toEqual({
      text: 'Không đặt hạn', tone: 'none', frozen: false,
    })
  })

  it('ĐANG TẠM DỪNG thì đồng hồ đóng băng ở mốc bắt đầu dừng', () => {
    // Cả tính năng tạm dừng sinh ra để nhân viên không bị tính giờ cho việc mình
    // không gây ra. Đồng hồ vẫn chạy thì họ vẫn thấy mình sắp trễ, và tính năng
    // đó vô nghĩa với người dùng.
    const dungLuc = new Date(MOC - 20 * 3_600_000).toISOString()
    const dong = countdown(sau(4), { now: MOC, pausedAt: dungLuc })

    expect(dong.frozen).toBe(true)
    expect(dong.tone).toBe('paused')
    // Đo tới lúc bắt đầu dừng: hạn còn 4 giờ, dừng từ 20 giờ trước → còn 24 giờ.
    expect(dong.text).toBe('Còn 1 ngày')
  })

  it('cùng một mốc thì cho ra cùng một kết quả, không phụ thuộc giờ chạy test', () => {
    expect(countdown(sau(9), { now: MOC })).toEqual(countdown(sau(9), { now: MOC }))
  })
})

describe('Hạn nào đang có hiệu lực', () => {
  it('bước bị trả về sửa đọc hạn MỚI, không đọc hạn cũ đã trôi qua', () => {
    // Dùng lại hạn cũ là bước vừa mở lại đã đỏ quá hạn dù nhân viên chưa kịp làm
    // gì — và mọi cảnh báo trễ từ đó thành vô nghĩa vì lúc nào cũng đỏ.
    const task = {
      status: 'rework_required',
      deadline_at: '2026-01-01T00:00:00Z',
      rework_deadline_at: '2026-09-11T00:00:00Z',
    }
    expect(effectiveDeadline(task)).toBe('2026-09-11T00:00:00Z')
  })

  it('bước đang chạy bình thường vẫn đọc hạn gốc', () => {
    const task = {
      status: 'in_progress',
      deadline_at: '2026-09-20T00:00:00Z',
      rework_deadline_at: '2026-09-11T00:00:00Z',
    }
    expect(effectiveDeadline(task)).toBe('2026-09-20T00:00:00Z')
  })
})

describe('Badge đếm giấy', () => {
  const documents = [
    { template_id: 'A', document_id: 'd1', review_status: 'approved' },
    { template_id: 'B', document_id: 'd2', review_status: 'pending_review' },
    { template_id: 'C' },
  ]

  it('đang làm thì đếm ĐÃ TẢI, không đếm mỗi đã duyệt', () => {
    // Lấy cứng "đã duyệt" thì nhân viên đang làm luôn thấy 0/3 — một con số 0
    // ngay đầu danh mục đọc như "bạn chưa làm gì".
    const badge = documentCounter(documents, 'in_progress')
    expect(badge.primary).toBe('2/3')
    expect(badge.note).toMatch(/đã tải/)
  })

  it('nộp rồi thì chuyển sang đếm ĐÃ DUYỆT — đó mới là con số quyết định', () => {
    expect(documentCounter(documents, 'submitted').primary).toBe('1/3')
    expect(documentCounter(documents, 'submitted').note).toBe('đã duyệt')
  })

  it('bước bị trả về sửa vẫn đếm đã tải, vì nhân viên đang nộp lại', () => {
    expect(documentCounter(documents, 'rework_required').primary).toBe('2/3')
  })
})

describe('Trộn phán quyết vào loại giấy đầu ra', () => {
  it('lấy đúng phán quyết theo template_id', () => {
    const item = {
      output_documents: [{ template_id: 'T-BANVE', min_count: 1 }],
      review_by_template: {
        'T-BANVE': { document_id: 'd9', review_status: 'rejected', rejection_reason: 'Ảnh mờ' },
      },
    }
    expect(mergeDocumentVerdicts(item)[0]).toMatchObject({
      template_id: 'T-BANVE', review_status: 'rejected', rejection_reason: 'Ảnh mờ',
    })
  })

  it('chưa có phán quyết thì giữ nguyên cấu hình, không bịa trạng thái', () => {
    const item = { output_documents: [{ template_id: 'T-CCCD' }] }
    expect(mergeDocumentVerdicts(item)[0].review_status).toBeUndefined()
  })
})

describe('Định dạng tiền', () => {
  it('một cách viết duy nhất cho cả màn', () => {
    expect(formatMoney(1000000)).toBe('1.000.000đ')
    expect(formatMoney(0)).toBe('0đ')
    expect(formatMoney(null)).toBe('0đ')
  })
})
