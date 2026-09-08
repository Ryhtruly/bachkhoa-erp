import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Save, Plus, FileText, Settings, Layers, AlertCircle } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import CustomSelect from '../../components/ui/CustomSelect'
import PackageScopeMatrix from './PackageScopeMatrix'

/**
 * Thiết lập mẫu giấy tờ — Thiết kế tinh gọn, hiện đại, phân nhóm rõ ràng:
 * 1. Thông tin mẫu giấy (Tên giấy, Nguồn phát sinh, Bước thực hiện)
 * 2. Phạm vi áp dụng (Ma trận Gói / Hạng mục)
 * 3. Quy cách & Thuộc tính (Bắt buộc, Bản chính, Hiệu lực, Số lượng, Thứ tự)
 */

const SOURCE_OPTIONS = [
  { value: 'KHACH_HANG', label: 'Khách hàng cung cấp' },
  { value: 'CO_QUAN', label: 'Cơ quan Nhà nước cấp' },
  { value: 'CONG_TY', label: 'Công ty soạn / lập' },
]

export default function TemplateFormModal({
  open, mode, value, packageTree, nodes, lockedScopeLabel, saving, onChange, onSubmit, onClose,
}) {
  if (!open) return null

  const editing = mode === 'edit'
  const set = (patch) => onChange({ ...value, ...patch })

  const chuaChonPhamVi = !editing
    && !value.scope.globalAll
    && value.scope.packageIds.length === 0
    && value.scope.taskTypeIds.length === 0
  const guiDuoc = value.name.trim().length >= 3 && !chuaChonPhamVi && !saving

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Chỉnh sửa mẫu giấy tờ' : 'Thiết lập mẫu giấy tờ mới'}
      size="lg"
      className="tfm"
      footer={
        <div className="tfm__actions">
          <button type="button" className="btn-cancel" onClick={onClose}>Huỷ</button>
          <button
            type="submit"
            form="tfm-form"
            className="btn-primary"
            disabled={!guiDuoc}
          >
            {editing ? <Save size={15} /> : <Plus size={15} />}
            <span>{saving ? 'Đang lưu…' : (editing ? 'Lưu' : 'Thêm')}</span>
          </button>
        </div>
      }
    >
      <form
        id="tfm-form"
        className="tfm__form"
        onSubmit={(event) => { event.preventDefault(); if (guiDuoc) onSubmit() }}
      >
        {/* Khối 1: Thông tin cơ bản */}
        <section className="tfm__section">
          <div className="tfm__section-head">
            <FileText size={15} />
            <span>Thông tin mẫu giấy tờ</span>
          </div>

          <label className="tfm__field">
            <span className="tfm__field-label">Tên mẫu giấy tờ <em className="tfm__req">*</em></span>
            <input
              value={value.name}
              required
              autoFocus
              className="tfm__input"
              placeholder="Ví dụ: Đơn đăng ký biến động đất đai (09/ĐK)..."
              onChange={(event) => set({ name: event.target.value })}
            />
          </label>

          <div className="tfm__row-2">
            <div className="tfm__field">
              <span className="tfm__field-label">Nguồn gốc phát sinh</span>
              <CustomSelect
                value={value.source}
                onChange={(source) => set({ source })}
                options={SOURCE_OPTIONS}
                aria-label="Nguồn gốc phát sinh"
              />
            </div>

            <div className="tfm__field">
              <span className="tfm__field-label">Bước quy trình thực hiện (Node)</span>
              <CustomSelect
                value={value.nodeCode || ''}
                onChange={(nodeCode) => set({ nodeCode })}
                placeholder="— Chưa gán bước (Áp dụng chung) —"
                options={[
                  { value: '', label: '— Chưa gán bước (Áp dụng chung) —' },
                  ...(nodes || []).map(node => ({
                    value: node.code,
                    label: `${node.code} · ${node.name}`,
                  })),
                ]}
                aria-label="Bước quy trình thực hiện (Node)"
              />
            </div>
          </div>
        </section>

        {/* Khối 2: Phạm vi áp dụng */}
        <section className="tfm__section">
          <div className="tfm__section-head">
            <Layers size={15} />
            <span>Phạm vi áp dụng trong quy trình</span>
          </div>

          {editing ? (
            <div className="tfm__locked">
              <Lock size={16} />
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
            <div className="tfm__canhbao" role="alert">
              <AlertCircle size={15} />
              <span>Chưa chọn phạm vi nào — tờ giấy này sẽ không hiện ở hợp đồng nào.</span>
            </div>
          )}
        </section>

        {/* Khối 3: Quy cách & Thuộc tính */}
        <section className="tfm__section">
          <div className="tfm__section-head">
            <Settings size={15} />
            <span>Quy cách & Thiết lập lưu trữ</span>
          </div>

          <label className="tfm__field">
            <span className="tfm__field-label">Ghi chú lưu trữ & bàn giao</span>
            <textarea
              rows={2}
              className="tfm__textarea"
              value={value.note}
              placeholder="Ví dụ: Bản chính cất Tủ hồ sơ D, bản sao kẹp cùng hồ sơ giao dịch..."
              onChange={(event) => set({ note: event.target.value })}
            />
          </label>

          <div className="tfm__settings-grid">
            <div className="tfm__tiles">
              <label className={`tfm__tile${value.is_required ? ' is-checked is-required' : ''}`}>
                <input
                  type="checkbox"
                  checked={value.is_required}
                  onChange={(event) => set({ is_required: event.target.checked })}
                />
                <div className="tfm__tile-text">
                  <strong>Bắt buộc</strong>
                  <small>Hồ sơ thiếu sẽ chặn nghiệm thu</small>
                </div>
              </label>

              <label className={`tfm__tile${value.needs_original ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={value.needs_original}
                  onChange={(event) => set({ needs_original: event.target.checked })}
                />
                <div className="tfm__tile-text">
                  <strong>Cần bản chính</strong>
                  <small>Thu giữ bản gốc / sổ đỏ</small>
                </div>
              </label>

              <label className={`tfm__tile${value.is_active ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={value.is_active}
                  onChange={(event) => set({ is_active: event.target.checked })}
                />
                <div className="tfm__tile-text">
                  <strong>Đang áp dụng</strong>
                  <small>Bật trong danh mục mẫu</small>
                </div>
              </label>
            </div>

            <div className="tfm__numbers">
              <label className="tfm__field tfm__field--mini">
                <span className="tfm__field-label">Số lượng</span>
                <input
                  type="number"
                  min="1"
                  className="tfm__input tfm__input--num"
                  value={value.default_quantity}
                  onChange={(event) => set({ default_quantity: Number(event.target.value) })}
                />
              </label>

              <label className="tfm__field tfm__field--mini">
                <span className="tfm__field-label">Thứ tự</span>
                <input
                  type="number"
                  className="tfm__input tfm__input--num"
                  value={value.sort_order}
                  onChange={(event) => set({ sort_order: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>

          {value.is_required && (
            <p className="dts-warn">
              ⚠️ Giấy <strong>bắt buộc</strong> thì hồ sơ thiếu nó sẽ không nộp nghiệm
              thu được. Chỉ tick khi thủ tục thật sự đòi.
            </p>
          )}
        </section>
      </form>
    </Modal>
  )
}

