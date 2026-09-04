/**
 * Định dạng dùng chung cho màn làm việc theo Node.
 *
 * Trước khi có file này, riêng employee-portal đã có 6 bản đếm ngược và 4 bản
 * định dạng tiền, nói khác nhau: chỗ ghi "SLA 3 ngày", chỗ ghi "Còn 3 ngày",
 * chỗ ghi "còn 3 ngày · hạn 25/08". Cùng một hồ sơ, ba màn nói ba kiểu.
 *
 * Mọi hàm nhận `now` làm tham số thay vì đọc đồng hồ hệ thống — test truyền mốc
 * cố định thì chạy 23:59 hay 00:01 cũng ra một kết quả.
 */

const PHUT = 60_000
const GIO = 60 * PHUT
const NGAY = 24 * GIO
const THANG = 30 * NGAY

export const formatMoney = (value) =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))}đ`

/**
 * Đồng hồ đếm ngược theo tháng / ngày / giờ / phút.
 *
 * Trả về `{ text, tone, frozen }`:
 *   tone 'overdue' quá hạn · 'urgent' còn dưới một ngày · 'normal' · 'paused'
 *
 * Bước đang tạm dừng thì đồng hồ ĐÓNG BĂNG. Đây không phải chi tiết trang trí:
 * cả tính năng tạm dừng sinh ra để nhân viên không bị tính giờ cho việc mình
 * không gây ra, mà đồng hồ vẫn chạy đỏ thì họ vẫn thấy mình sắp trễ — và tính
 * năng đó vô nghĩa với người dùng.
 */
export function countdown(deadlineAt, { now = Date.now(), pausedAt = null } = {}) {
  if (!deadlineAt) return { text: 'Không đặt hạn', tone: 'none', frozen: false }

  const han = new Date(deadlineAt).getTime()
  if (Number.isNaN(han)) return { text: 'Không đặt hạn', tone: 'none', frozen: false }

  // Đang tạm dừng thì đo tới lúc BẮT ĐẦU DỪNG, không đo tới bây giờ.
  const moc = pausedAt ? new Date(pausedAt).getTime() : now
  const conLai = han - (Number.isNaN(moc) ? now : moc)
  const quaHan = conLai < 0
  const doDai = Math.abs(conLai)

  const phan = []
  let du = doDai
  const thang = Math.floor(du / THANG); du -= thang * THANG
  const ngay = Math.floor(du / NGAY); du -= ngay * NGAY
  const gio = Math.floor(du / GIO); du -= gio * GIO
  const phut = Math.floor(du / PHUT)

  if (thang) phan.push(`${thang} tháng`)
  if (ngay) phan.push(`${ngay} ngày`)
  // Còn nhiều tháng thì giờ và phút là nhiễu; chỉ hiện khi đã gần hạn.
  if (!thang && gio) phan.push(`${gio} giờ`)
  if (!thang && !ngay && phut) phan.push(`${phut} phút`)
  if (!phan.length) phan.push('dưới 1 phút')

  const text = `${quaHan ? 'Quá hạn' : 'Còn'} ${phan.join(' ')}`
  if (pausedAt) return { text, tone: 'paused', frozen: true }
  if (quaHan) return { text, tone: 'overdue', frozen: false }
  return { text, tone: doDai < NGAY ? 'urgent' : 'normal', frozen: false }
}

/**
 * Hạn nào đang có hiệu lực cho bước này.
 *
 * Bước bị kéo về sửa đọc hạn MỚI. Dùng lại `deadline_at` cũ là bước vừa mở lại
 * đã đỏ quá hạn dù nhân viên chưa kịp làm gì — và mọi cảnh báo trễ từ đó thành
 * vô nghĩa vì lúc nào cũng đỏ.
 */
export function effectiveDeadline(task) {
  if (!task) return null
  if (task.status === 'rework_required' && task.rework_deadline_at) {
    return task.rework_deadline_at
  }
  return task.deadline_at || null
}

/**
 * Badge đếm giấy ở đầu danh mục, ĐỔI THEO trạng thái bước.
 *
 * Lấy cứng "đã duyệt / tổng" thì nhân viên đang làm luôn thấy `0/3`, vì lúc đó
 * chưa ai duyệt gì cả — một con số 0 ngay đầu danh mục đọc như "bạn chưa làm gì".
 * Đang làm thì cái họ cần biết là đã tải được mấy tờ.
 */
export function documentCounter(documents = [], nodeStatus) {
  const total = documents.length
  const uploaded = documents.filter(doc => doc.document_id).length
  const approved = documents.filter(doc => doc.review_status === 'approved').length

  if (nodeStatus === 'submitted' || nodeStatus === 'accepted' || nodeStatus === 'completed') {
    return { primary: `${approved}/${total}`, note: 'đã duyệt', total, uploaded, approved }
  }
  return {
    primary: `${uploaded}/${total}`,
    note: approved ? `đã tải · ${approved} duyệt` : 'đã tải',
    total,
    uploaded,
    approved,
  }
}

/** Trộn phán quyết từng tờ (runtime) vào cấu hình loại giấy đầu ra (graph). */
export function mergeDocumentVerdicts(checklistItem) {
  const verdicts = checklistItem?.review_by_template || {}
  return (checklistItem?.output_documents || []).map(doc => ({
    ...doc,
    ...(verdicts[doc.template_id] || {}),
  }))
}
