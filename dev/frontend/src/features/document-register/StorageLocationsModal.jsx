import { useState } from 'react'
import { Archive, Plus, Power, Save } from 'lucide-react'

import Modal from '../../components/ui/Modal'

/**
 * Danh mục nơi lưu bản cứng — Tủ 1, Kệ 2 ngăn 3…
 *
 * Trước đây nằm gập ở đáy màn Mẫu Giấy Tờ. Bố cục 3 cột đóng khung viewport
 * không còn chỗ cho nó, nhưng bỏ hẳn thì mất luôn đường thêm nơi lưu mới:
 * `DocumentRegister` đọc danh mục này cho nhân viên chọn chỗ cất từng tờ, và
 * dựng cảnh báo lệch trạng thái trên đó. Đây là chỗ DUY NHẤT sửa được danh mục.
 */

const EMPTY_PLACE = { id: null, name: '', kind: 'TAI_CHO', sort_order: 100, implies_status: '' }

const SLOT_STATUS_OPTIONS = [
  { value: '', label: '— Không ngụ ý trạng thái nào —' },
  { value: 'DA_NHAN', label: 'Đã nhận' },
  { value: 'DA_KY', label: 'Đã ký' },
  { value: 'DA_SCAN', label: 'Đã scan' },
  { value: 'DA_NOP', label: 'Đã nộp' },
  { value: 'BI_TRA_LAI', label: 'Được trả lại' },
]

export default function StorageLocationsModal({ open, places, onClose, onSave, onDeactivate }) {
  const [editing, setEditing] = useState(null)

  if (!open) return null

  const submit = async (event) => {
    event.preventDefault()
    await onSave(editing)
    setEditing(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<><Archive size={16} /> Danh mục nơi lưu bản cứng</>}
      size="lg"
    >
      <p className="dts-hint">
        Nhân viên chọn từ danh mục này thay vì gõ tay — “Tủ 1”, “tủ A”, “kệ 2 ngăn 3”
        gõ tự do sẽ thành ba nơi khác nhau của cùng một chỗ.
      </p>

      {editing ? (
        <form className="dts-form" onSubmit={submit}>
          <div className="dts-form__row">
            <label className="is-wide">
              Tên nơi lưu
              <input
                value={editing.name}
                required
                autoFocus
                placeholder="Ví dụ: Tủ hồ sơ D"
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>
            <label>
              Loại
              <select
                value={editing.kind}
                onChange={(event) => setEditing({ ...editing, kind: event.target.value })}
              >
                <option value="TAI_CHO">Trong kho công ty</option>
                <option value="BEN_NGOAI">Không ở công ty</option>
              </select>
            </label>
            <label>
              Ngụ ý trạng thái
              <select
                value={editing.implies_status || ''}
                onChange={(event) => setEditing({ ...editing, implies_status: event.target.value })}
              >
                {SLOT_STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="is-small">
              Thứ tự
              <input
                type="number"
                value={editing.sort_order}
                onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })}
              />
            </label>
            <div className="dts-form__actions">
              <button type="button" className="dts-cancel" onClick={() => setEditing(null)}>Huỷ</button>
              <button type="submit" className="dts-save"><Save size={14} /> Lưu</button>
            </div>
          </div>
          <p className="dts-warn">
            “Ngụ ý trạng thái” dùng để nhắc khi sổ ghi mâu thuẫn — ví dụ chọn
            <strong> Đang ở cơ quan</strong> mà trạng thái vẫn là “Đã nhận”.
            Hệ thống chỉ nhắc, không tự đổi.
          </p>
        </form>
      ) : (
        <button type="button" className="dts-new" onClick={() => setEditing({ ...EMPTY_PLACE })}>
          <Plus size={14} /> Thêm nơi lưu
        </button>
      )}

      <table className="dr-table">
        <thead>
          <tr><th>Nơi lưu</th><th>Loại</th><th>Ngụ ý trạng thái</th><th /></tr>
        </thead>
        <tbody>
          {(places || []).map(place => (
            <tr key={place.id}>
              <td className="dr-name">{place.name}</td>
              <td>{place.is_external ? 'Không ở công ty' : 'Trong kho công ty'}</td>
              <td>{place.implies_status_label || '—'}</td>
              <td className="dts-row-actions">
                <button
                  type="button"
                  onClick={() => setEditing({ ...place, implies_status: place.implies_status || '' })}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="is-off"
                  onClick={() => onDeactivate(place)}
                  title="Tắt khỏi danh mục"
                >
                  <Power size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
