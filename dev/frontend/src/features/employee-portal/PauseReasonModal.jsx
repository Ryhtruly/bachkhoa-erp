import { useState } from 'react'
import { ArrowRight, MessageSquareQuote, Pause, PauseCircle } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/**
 * Chọn lý do tạm dừng một bước.
 *
 * ── Vì sao phải chọn lý do, không chỉ bấm "dừng" ────────────────────────────
 * Tạm dừng là để nhân viên KHÔNG bị tính giờ cho việc mình không gây ra. Muốn
 * vậy thì phải phân biệt được "chờ cơ quan ra thông báo thuế" với "tôi bận".
 * Lý do chính là thứ phân biệt hai chuyện đó, nên nó bắt buộc.
 *
 * ── Vì sao bắt ghi rõ đang chờ gì ───────────────────────────────────────────
 * Người tiếp nhận sau — hoặc chính người này ba tuần nữa — đọc đúng dòng ghi chú
 * để biết hồ sơ đang đứng ở đâu. Chọn "chờ cơ quan" rồi để trống thì họ vẫn phải
 * đi hỏi lại từ đầu.
 *
 * ── SURVEYOR đi tiếp một nhịp nữa ───────────────────────────────────────────
 * Bản vẽ sai ranh nghĩa là phải kéo bước ĐO VẼ về sửa. Đó là việc nặng — mở lại
 * những bước đã nghiệm thu xong — nên không dừng ở đây mà mở tiếp bảng chọn node.
 * Chọn lý do tạm dừng một bước — Thiết kế chuẩn Card sections theo Design System (Hình 1).
 */

export const PAUSE_REASONS = [
  {
    code: 'AGENCY',
    label: 'Chờ cơ quan',
    detail: 'Cơ quan đang xử lý, ra thông báo thuế hoặc đòi bổ sung giấy tờ.',
  },
  {
    code: 'SURVEYOR',
    label: 'Chờ đo vẽ sửa',
    detail: 'Bản vẽ sai ranh, phải kéo bước đo vẽ về sửa lại.',
  },
  {
    code: 'INTERNAL',
    label: 'Chờ nội bộ',
    detail: 'Chờ sếp ký, hoặc chờ khách đóng thuế.',
  },
]

const MIN_NOTE = 5

export default function PauseReasonModal({ open, onClose, onConfirm, busy = false }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const noteReady = note.trim().length >= MIN_NOTE
  const ready = Boolean(reason) && noteReady

  const close = () => { setReason(''); setNote(''); onClose?.() }

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Lý do tạm dừng"
      footer={
        <div className="eiw-modal__foot">
          <button type="button" className="eiw-btn" onClick={close}>Huỷ</button>
          <button
            type="button"
            className="eiw-btn eiw-btn--go"
            disabled={!ready || busy}
            onClick={() => onConfirm?.({ reason_type: reason, note: note.trim() })}
          >
            {reason === 'SURVEYOR' ? (
              <>
                <span>Tiếp tục chọn bước</span>
                <ArrowRight size={15} />
              </>
            ) : (
              <>
                <Pause size={15} />
                <span>Tạm dừng</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="eiw-modal-sections">
        {/* Khối 1: Nguyên nhân tạm dừng */}
        <section className="eiw-modal__section">
          <div className="eiw-modal__section-head">
            <PauseCircle size={16} />
            <span>Nguyên nhân tạm dừng</span>
          </div>

          <ul className="eiw-reasons">
            {PAUSE_REASONS.map(item => (
              <li key={item.code}>
                <label className={`eiw-reason${reason === item.code ? ' is-picked' : ''}`}>
                  <input
                    type="radio"
                    name="pause-reason"
                    value={item.code}
                    checked={reason === item.code}
                    onChange={() => setReason(item.code)}
                  />
                  <span className="eiw-reason__body">
                    <b>{item.label}</b>
                    <span>{item.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Khối 2: Chi tiết lý do & ghi chú */}
        <section className="eiw-modal__section">
          <div className="eiw-modal__section-head">
            <MessageSquareQuote size={16} />
            <span>Chi tiết lý do & ghi chú</span>
          </div>

          <label className="eiw-modal__field">
            <span className="eiw-modal__field-label">
              Đang chờ gì <em className="eiw-modal__req">*</em>
            </span>
            <textarea
              rows={3}
              value={note}
              className="eiw-modal__textarea"
              placeholder="Ví dụ: Chờ chi cục thuế ra thông báo, hẹn tuần sau."
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {!noteReady && note.length > 0 && (
            <p className="eiw-modal__warn">
              Ghi rõ hơn một chút — người tiếp nhận sau đọc đúng dòng này để biết hồ sơ đang đứng ở đâu.
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}
