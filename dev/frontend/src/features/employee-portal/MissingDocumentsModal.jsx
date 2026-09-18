import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/**
 * Cảnh báo và yêu cầu giải trình trước khi nộp nghiệm thu khi hồ sơ còn thiếu tài liệu
 * hoặc checklist chưa có loại giấy tờ.
 */
export default function MissingDocumentsModal({
  open,
  items = [],
  isSubmitting = false,
  onCancel,
  onConfirm,
  // Backward compatibility
  danhSach,
  dangGui,
  onHuy,
  onXacNhan,
}) {
  const [reason, setReason] = useState('')

  const list = items.length ? items : (danhSach || [])
  const submitting = isSubmitting || Boolean(dangGui)
  const handleCancel = onCancel || onHuy
  const handleConfirm = onConfirm || onXacNhan

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const totalMissing = list.reduce(
    (total, group) => total + (group.missing || group.thieu || []).reduce((sub, item) => sub + (item.remaining || item.con_thieu || 0), 0),
    0,
  )
  const hasPaperless = list.some(m => m.is_paperless)

  const handleSubmit = () => {
    handleConfirm?.(reason.trim() || null)
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Hồ sơ còn thiếu tài liệu" size="md" id="thieu-tai-lieu">
      <div className="mtl">
        <p className="mtl__dau">
          <AlertTriangle size={15} />
          {hasPaperless && totalMissing > 0 ? (
            <span>
              Hồ sơ còn <strong>{totalMissing}</strong> bản tài liệu chưa nộp và có checklist chưa phân loại giấy tờ.
              Vui lòng đính kèm lý do giải trình để Giám đốc duyệt.
            </span>
          ) : hasPaperless ? (
            <span>
              Checklist chưa có phân loại giấy tờ. Vui lòng đính kèm lý do/ghi chú hoàn thành để nộp nghiệm thu.
            </span>
          ) : (
            <span>
              Còn <strong>{totalMissing}</strong> bản tài liệu chưa nộp. Bạn vẫn gửi được,
              nhưng Giám đốc sẽ thấy đúng danh sách này khi duyệt.
            </span>
          )}
        </p>

        {list.map(group => (
          <div className="mtl__nhom" key={group.checklist_result_id || group.checklist_name}>
            <div className="mtl__ten">{group.checklist_name}</div>
            <ul className="mtl__ds">
              {(group.missing || group.thieu || []).map(item => (
                <li key={`${group.checklist_name}:${item.name}`}>
                  {item.name}
                  {(item.required_count ?? item.can) > 0 ? (
                    <span className="mtl__so">
                      cần {item.required_count ?? item.can} · đã có {item.provided_count ?? item.da_co} · <strong>thiếu {item.remaining ?? item.con_thieu}</strong>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mtl__lydo" style={{ marginTop: 14, marginBottom: 14 }}>
          <label
            htmlFor="mtl-reason-textarea"
            style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#334155' }}
          >
            Lý do / Giải trình hồ sơ {hasPaperless && <span style={{ color: '#dc2626' }}>*</span>}
          </label>
          <textarea
            id="mtl-reason-textarea"
            className="form-control"
            rows={3}
            placeholder={
              hasPaperless
                ? 'Nhập lý do hoàn thành checklist chưa có loại giấy (bắt buộc)...'
                : 'Nhập lý do chưa có giấy tờ hoặc giải trình thực hiện...'
            }
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={submitting}
            style={{ width: '100%', fontSize: 13, borderRadius: 8, padding: '8px 10px' }}
          />
        </div>

        <p className="mtl__hoi">Checklist chưa đủ tài liệu. Bạn có chắc muốn nộp không?</p>

        <div className="mtl__nut">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel} disabled={submitting}>
            Quay lại bổ sung
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={submitting || (hasPaperless && !reason.trim())}
          >
            {submitting ? 'Đang gửi…' : 'Vẫn nộp nghiệm thu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export { MissingDocumentsModal as ModalThieuTaiLieu }
