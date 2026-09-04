import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Save, Plus } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import PackageScopeMatrix from './PackageScopeMatrix'

/**
 * Thiết lập một loại giấy tờ — năm trục trong một hộp thoại.
 *
 *     Gói → Hạng mục → Nhóm nguồn gốc → Node thực thi → Loại giấy tờ
 *
 * Hai chế độ ghi khác hẳn nhau, và đó là chỗ giữ tính độc lập giữa các nhánh:
 *
 *   Thêm mới  ma trận mở, tick bao nhiêu phạm vi cũng được, cùng MỘT bước
 *   Sửa       ma trận KHOÁ ở đúng ngữ cảnh đang đứng, chỉ đổi được bước
 *
 * Khoá ma trận khi Sửa là cách trực tiếp nhất để nút Sửa không bao giờ chạm hạng
 * mục khác. Đổi phạm vi là chuyển bản ghi sang nhánh khác, mà nhánh đích có thể
 * đã có bản ghi của chính tờ giấy này — muốn vậy thì gỡ rồi khai lại.
 */

const SOURCE_OPTIONS = [
  { value: 'KHACH_HANG', label: 'Khách hàng cung cấp' },
  { value: 'CO_QUAN', label: 'Cơ quan Nhà nước trả' },
  { value: 'CONG_TY', label: 'Công ty soạn/lập' },
]

/**
 * Chọn bước — radio, đúng một bước cho mỗi bản ghi gán.
 *
 * Gập lại được vì tám bước chiếm gần nửa hộp thoại, nhưng dòng tóm tắt luôn hiện
 * bước đang chọn: gập mà không thấy mình đã chọn gì là mở ra tick lại từ đầu.
 */
function NodePicker({ value, nodes, onChange }) {
  const [open, setOpen] = useState(false)
  const chosen = (nodes || []).find(node => node.code === value)

  return (
    <div className="tfm-node">
      <button
        type="button"
        className="tfm-node__head"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span className="tfm-node__label">Node áp dụng</span>
        <span className={`tfm-node__chon${chosen ? '' : ' is-chua'}`}>
          {chosen ? `${chosen.code} · ${chosen.name}` : '— chưa gán bước —'}
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>

      {open && (
        <div className="tfm-node__list" role="radiogroup" aria-label="Node áp dụng">
          {/* Bỏ trống là lựa chọn hợp lệ, và phải bấm được: không có dòng này thì
              một bước tick nhầm sẽ không gỡ ra được. */}
          <label className="tfm-node__item">
            <input
              type="radio"
              name="node-ap-dung"
              checked={!value}
              onChange={() => onChange('')}
            />
            <span className="is-chua">— chưa gán bước —</span>
          </label>
          {(nodes || []).map(node => (
            <label key={node.code} className="tfm-node__item">
              <input
                type="radio"
                name="node-ap-dung"
                checked={value === node.code}
                onChange={() => onChange(node.code)}
              />
              <span><b>{node.code}</b> · {node.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TemplateFormModal({
  open, mode, value, packageTree, nodes, lockedScopeLabel, saving, onChange, onSubmit, onClose,
}) {
  if (!open) return null

  const editing = mode === 'edit'
  const set = (patch) => onChange({ ...value, ...patch })

  // Thêm mới mà chưa chọn phạm vi nào thì bản ghi không rơi vào đâu — tờ giấy sẽ
  // không hiện ở màn nhân viên nào. Chặn ngay chứ không để lưu ra một dòng chết.
  const chuaChonPhamVi = !editing
    && !value.scope.globalAll
    && value.scope.packageIds.length === 0
    && value.scope.taskTypeIds.length === 0
  const guiDuoc = value.name.trim().length >= 3 && !chuaChonPhamVi && !saving

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thiết lập mẫu giấy tờ"
      size="lg"
      className="tfm"
      footer={
        <div className="tfm__actions">
          <button type="button" className="dts-cancel" onClick={onClose}>Huỷ</button>
          <button
            type="submit"
            form="tfm-form"
            className="dts-save"
            disabled={!guiDuoc}
          >
            {editing ? <Save size={14} /> : <Plus size={14} />}
            {saving ? 'Đang lưu…' : (editing ? 'Lưu' : 'Thêm')}
          </button>
        </div>
      }
    >
      <form
        id="tfm-form"
        className="tfm__form"
        onSubmit={(event) => { event.preventDefault(); if (guiDuoc) onSubmit() }}
      >
        <label className="tfm__field">
          Tên giấy
          <input
            value={value.name}
            required
            autoFocus
            placeholder="Ví dụ: Đơn đăng ký biến động đất đai (09/ĐK)"
            onChange={(event) => set({ name: event.target.value })}
          />
        </label>

        {/* Nhóm nguồn gốc thuộc về chính tờ giấy, không thuộc phạm vi: "CCCD" thì
            gói nào cũng do khách cấp. Nó quyết định tờ giấy nằm ngăn nào của tủ
            hồ sơ, nên đúng một giá trị. */}
        <label className="tfm__field">
          Nhóm giấy
          <select value={value.source} onChange={(event) => set({ source: event.target.value })}>
            {SOURCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <NodePicker
          value={value.nodeCode}
          nodes={nodes}
          onChange={(code) => set({ nodeCode: code })}
        />

        {editing ? (
          <div className="tfm__locked">
            <Lock size={14} />
            <div>
              <strong>{lockedScopeLabel}</strong>
              <p>
                Sửa ở đây chỉ đổi bước cho đúng phạm vi này. Cấu hình của hạng mục
                khác giữ nguyên — muốn đổi phạm vi thì gỡ bản ghi rồi khai lại.
              </p>
            </div>
          </div>
        ) : (
          <PackageScopeMatrix
            value={value.scope}
            packageTree={packageTree}
            onChange={(scope) => set({ scope })}
          />
        )}

        {chuaChonPhamVi && (
          <p className="tfm__canhbao" role="alert">
            Chưa chọn phạm vi nào — tờ giấy này sẽ không hiện ở hợp đồng nào.
          </p>
        )}

        <label className="tfm__field">
          Ghi chú lưu trữ
          <textarea
            rows={2}
            value={value.note}
            placeholder="Ví dụ: bản chính cất Tủ hồ sơ D, bản sao kẹp cùng hồ sơ"
            onChange={(event) => set({ note: event.target.value })}
          />
        </label>

        <div className="tfm__flags">
          <label className="is-check">
            <input
              type="checkbox"
              checked={value.is_required}
              onChange={(event) => set({ is_required: event.target.checked })}
            />
            Bắt buộc
          </label>
          <label className="is-check">
            <input
              type="checkbox"
              checked={value.needs_original}
              onChange={(event) => set({ needs_original: event.target.checked })}
            />
            Cần bản chính
          </label>
          <label className="is-check">
            <input
              type="checkbox"
              checked={value.is_active}
              onChange={(event) => set({ is_active: event.target.checked })}
            />
            Đang bật
          </label>
          <label className="is-small">
            Số lượng
            <input
              type="number"
              min="1"
              value={value.default_quantity}
              onChange={(event) => set({ default_quantity: Number(event.target.value) })}
            />
          </label>
          <label className="is-small">
            Thứ tự
            <input
              type="number"
              value={value.sort_order}
              onChange={(event) => set({ sort_order: Number(event.target.value) })}
            />
          </label>
        </div>

        {value.is_required && (
          <p className="dts-warn">
            ⚠️ Giấy <strong>bắt buộc</strong> thì hồ sơ thiếu nó sẽ không nộp nghiệm
            thu được. Chỉ tick khi thủ tục thật sự đòi.
          </p>
        )}
      </form>
    </Modal>
  )
}
