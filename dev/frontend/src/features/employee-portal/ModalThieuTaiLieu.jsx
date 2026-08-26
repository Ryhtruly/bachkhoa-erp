import { AlertTriangle } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/**
 * Cảnh báo trước khi nộp nghiệm thu khi hồ sơ còn thiếu tài liệu.
 *
 * Không khoá nút nộp — giấy khách không có thật thì khoá là treo bước vĩnh
 * viễn, và nhân viên chỉ còn cách nhét đại một tệp cho qua cổng. Nhưng cũng
 * không được cho đi im lặng: phải bày đúng thiếu gì, thiếu mấy bản, rồi buộc
 * người nộp bấm xác nhận. Danh sách này chính là thứ được lưu lại và đưa cho
 * Giám đốc đọc lúc duyệt.
 */
export default function ModalThieuTaiLieu({ open, danhSach = [], dangGui, onHuy, onXacNhan }) {
  const tongThieu = danhSach.reduce(
    (tong, muc) => tong + muc.thieu.reduce((t, x) => t + (x.con_thieu || 0), 0),
    0,
  )

  return (
    <Modal open={open} onClose={onHuy} title="Hồ sơ còn thiếu tài liệu" size="md" id="thieu-tai-lieu">
      <div className="mtl">
        <p className="mtl__dau">
          <AlertTriangle size={15} />
          Còn <strong>{tongThieu}</strong> bản tài liệu chưa nộp. Bạn vẫn gửi được,
          nhưng Giám đốc sẽ thấy đúng danh sách này khi duyệt.
        </p>

        {danhSach.map(muc => (
          <div className="mtl__nhom" key={muc.checklist_result_id || muc.checklist_name}>
            <div className="mtl__ten">{muc.checklist_name}</div>
            <ul className="mtl__ds">
              {muc.thieu.map(x => (
                <li key={`${muc.checklist_name}:${x.name}`}>
                  {x.name}
                  <span className="mtl__so">
                    cần {x.can} · đã có {x.da_co} · <strong>thiếu {x.con_thieu}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="mtl__hoi">Checklist chưa đủ tài liệu. Bạn có chắc muốn nộp không?</p>

        <div className="mtl__nut">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onHuy} disabled={dangGui}>
            Quay lại bổ sung
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onXacNhan} disabled={dangGui}>
            {dangGui ? 'Đang gửi…' : 'Vẫn nộp nghiệm thu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
