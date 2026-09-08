import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/**
 * Cảnh báo và yêu cầu giải trình trước khi nộp nghiệm thu khi hồ sơ còn thiếu tài liệu
 * hoặc checklist chưa có loại giấy tờ.
 *
 * Không khoá nút nộp — giấy khách không có thật thì khoá là treo bước vĩnh
 * viễn, và nhân viên chỉ còn cách nhét đại một tệp cho qua cổng. Nhưng bắt buộc
 * phải đính kèm lý do giải trình để Giám đốc xem xét khi duyệt.
 */
export default function ModalThieuTaiLieu({ open, danhSach = [], dangGui, onHuy, onXacNhan }) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const tongThieu = danhSach.reduce(
    (tong, muc) => tong + (muc.thieu || []).reduce((t, x) => t + (x.con_thieu || 0), 0),
    0,
  )
  const coPaperless = danhSach.some(m => m.is_paperless)

  const handleSubmit = () => {
    onXacNhan(reason.trim() || null)
  }

  return (
    <Modal open={open} onClose={onHuy} title="Hồ sơ còn thiếu tài liệu" size="md" id="thieu-tai-lieu">
      <div className="mtl">
        <p className="mtl__dau">
          <AlertTriangle size={15} />
          {coPaperless && tongThieu > 0 ? (
            <span>
              Hồ sơ còn <strong>{tongThieu}</strong> bản tài liệu chưa nộp và có checklist chưa phân loại giấy tờ.
              Vui lòng đính kèm lý do giải trình để Giám đốc duyệt.
            </span>
          ) : coPaperless ? (
            <span>
              Checklist chưa có phân loại giấy tờ. Vui lòng đính kèm lý do/ghi chú hoàn thành để nộp nghiệm thu.
            </span>
          ) : (
            <span>
              Còn <strong>{tongThieu}</strong> bản tài liệu chưa nộp. Bạn vẫn gửi được,
              nhưng Giám đốc sẽ thấy đúng danh sách này khi duyệt.
            </span>
          )}
        </p>

        {danhSach.map(muc => (
          <div className="mtl__nhom" key={muc.checklist_result_id || muc.checklist_name}>
            <div className="mtl__ten">{muc.checklist_name}</div>
            <ul className="mtl__ds">
              {(muc.thieu || []).map(x => (
                <li key={`${muc.checklist_name}:${x.name}`}>
                  {x.name}
                  {x.can > 0 ? (
                    <span className="mtl__so">
                      cần {x.can} · đã có {x.da_co} · <strong>thiếu {x.con_thieu}</strong>
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
            Lý do / Giải trình hồ sơ {coPaperless && <span style={{ color: '#dc2626' }}>*</span>}
          </label>
          <textarea
            id="mtl-reason-textarea"
            className="form-control"
            rows={3}
            placeholder={
              coPaperless
                ? 'Nhập lý do hoàn thành checklist chưa có loại giấy (bắt buộc)...'
                : 'Nhập lý do chưa có giấy tờ hoặc giải trình thực hiện...'
            }
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={dangGui}
            style={{ width: '100%', fontSize: 13, borderRadius: 8, padding: '8px 10px' }}
          />
        </div>

        <p className="mtl__hoi">Checklist chưa đủ tài liệu. Bạn có chắc muốn nộp không?</p>

        <div className="mtl__nut">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onHuy} disabled={dangGui}>
            Quay lại bổ sung
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={dangGui || (coPaperless && !reason.trim())}
          >
            {dangGui ? 'Đang gửi…' : 'Vẫn nộp nghiệm thu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
