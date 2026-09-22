import React, { useEffect, useState } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'

import ConfirmationModal from '../ui/ConfirmationModal'
import CustomSelect from '../ui/CustomSelect'
import Modal from '../ui/Modal'
import { apiFetch } from '../../lib/api'
import './CatalogManageModal.css'

export const PRESET_COLORS = [
  { hex: '#3b82f6', label: 'Xanh dương' },
  { hex: '#10b981', label: 'Xanh ngọc' },
  { hex: '#f59e0b', label: 'Vàng hổ phách' },
  { hex: '#8b5cf6', label: 'Tím hoa cà' },
  { hex: '#ec4899', label: 'Hồng sen' },
  { hex: '#f43f5e', label: 'Đỏ son' },
  { hex: '#06b6d4', label: 'Xanh lơ cyan' },
  { hex: '#6366f1', label: 'Chàm Indigo' },
  { hex: '#64748b', label: 'Xám thanh lịch' },
]

export const CATEGORY_TYPES = [
  { value: 'GENERAL', label: 'Tổng hợp / Chung' },
  { value: 'SURVEY', label: 'Đo đạc / Khảo sát' },
  { value: 'LEGAL', label: 'Pháp lý / Quy hoạch' },
  { value: 'CONSTRUCTION', label: 'Xây dựng / Hoàn công' },
]

/**
 * Modal quản trị Gói dịch vụ và Hạng mục công việc:
 * - targetType: 'PACKAGE' | 'TASK_TYPE'
 * - mode: 'create' | 'edit'
 * - item: object dữ liệu hiện tại (nếu mode === 'edit')
 * - parentPackageId: id gói cha (nếu targetType === 'TASK_TYPE')
 * - onSuccess: callback sau khi lưu/xoá thành công
 */
const EMPTY_ARRAY = []

export default function CatalogManageModal({
  open,
  targetType = 'PACKAGE',
  mode = 'create',
  item = null,
  parentPackageId = null,
  packageList = EMPTY_ARRAY,
  onClose,
  onSuccess,
  addToast,
}) {
  const isPackage = targetType === 'PACKAGE'
  const isEdit = mode === 'edit'

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [color, setColor] = useState(isPackage ? '#3b82f6' : '#10b981')
  const [categoryType, setCategoryType] = useState('GENERAL')
  const [selectedPackageId, setSelectedPackageId] = useState(parentPackageId || '')
  const [displayOrder, setDisplayOrder] = useState(100)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (isEdit && item) {
      setName(item.name || '')
      setCode(item.code || '')
      setColor(item.color || (isPackage ? '#3b82f6' : '#10b981'))
      setCategoryType(item.category_type || 'GENERAL')
      setSelectedPackageId(item.service_package_id || parentPackageId || '')
      setDisplayOrder(Number(item.display_order ?? 100))
      setIsActive(item.is_active !== false)
    } else {
      setName('')
      setCode('')
      setColor(isPackage ? '#3b82f6' : '#10b981')
      setCategoryType('GENERAL')
      setSelectedPackageId(parentPackageId || (packageList[0]?.id || ''))
      setDisplayOrder(100)
      setIsActive(true)
    }
  }, [open, mode, item?.id, isPackage, parentPackageId])

  if (!open) return null

  const handleSave = async (e) => {
    e?.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      addToast?.('Vui lòng nhập tên!', 'error')
      return
    }

    setSaving(true)
    try {
      if (isPackage) {
        if (isEdit) {
          await apiFetch(`/api/catalog/service-packages/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: trimmedName,
              color,
              category_type: categoryType,
              display_order: Number(displayOrder),
              is_active: isActive,
            }),
          })
          addToast?.('Cập nhật gói dịch vụ thành công!', 'success')
        } else {
          await apiFetch('/api/catalog/service-packages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: trimmedName,
              color,
              category_type: categoryType,
              display_order: Number(displayOrder),
            }),
          })
          addToast?.('Thêm mới gói dịch vụ thành công!', 'success')
        }
      } else {
        // TASK_TYPE
        const targetPkgId = selectedPackageId || parentPackageId
        if (!targetPkgId) {
          addToast?.('Vui lòng chọn gói dịch vụ cha!', 'error')
          setSaving(false)
          return
        }

        if (isEdit) {
          await apiFetch(`/api/catalog/task-types/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: trimmedName,
              code: code.trim() || undefined,
              color,
              category_type: categoryType,
              display_order: Number(displayOrder),
              is_active: isActive,
            }),
          })
          addToast?.('Cập nhật hạng mục công việc thành công!', 'success')
        } else {
          await apiFetch('/api/catalog/task-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_package_id: targetPkgId,
              name: trimmedName,
              code: code.trim() || undefined,
              color,
              category_type: categoryType,
              display_order: Number(displayOrder),
            }),
          })
          addToast?.('Thêm mới hạng mục công việc thành công!', 'success')
        }
      }
      onSuccess?.()
      onClose?.()
    } catch (err) {
      addToast?.(err.message || 'Lỗi khi lưu dữ liệu danh mục.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item?.id) return
    setSaving(true)
    try {
      if (isPackage) {
        await apiFetch(`/api/catalog/service-packages/${item.id}`, { method: 'DELETE' })
        addToast?.('Đã ẩn/xóa gói dịch vụ.', 'success')
      } else {
        await apiFetch(`/api/catalog/task-types/${item.id}`, { method: 'DELETE' })
        addToast?.('Đã ẩn/xóa hạng mục công việc.', 'success')
      }
      setShowConfirmDelete(false)
      onSuccess?.()
      onClose?.()
    } catch (err) {
      addToast?.(err.message || 'Lỗi khi xóa mục.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const title = isPackage
    ? (isEdit ? `Chỉnh sửa Gói Dịch Vụ: ${item?.name || ''}` : 'Thêm mới Gói Dịch Vụ')
    : (isEdit ? `Chỉnh sửa Hạng Mục: ${item?.name || ''}` : 'Thêm mới Hạng Mục Công Việc')

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        size="md"
        className="catalog-modal"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              {isEdit && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#dc2626',
                    borderColor: '#fca5a5',
                    background: '#fef2f2',
                  }}
                  onClick={() => setShowConfirmDelete(true)}
                  disabled={saving}
                >
                  <Trash2 size={15} /> Xoá mục
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
                Huỷ
              </button>
              <button
                type="submit"
                form="catalog-manage-form"
                onClick={handleSave}
                className="btn btn-primary btn-sm"
                disabled={saving || !name.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isEdit ? <Save size={16} /> : <Plus size={16} />}
                <span>{saving ? 'Đang lưu…' : (isEdit ? 'Lưu thay đổi' : 'Thêm mới')}</span>
              </button>
            </div>
          </div>
        }
      >
        <form id="catalog-manage-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isPackage && !isEdit && packageList.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                Thuộc Gói dịch vụ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <CustomSelect
                value={selectedPackageId}
                onChange={(val) => setSelectedPackageId(val)}
                options={packageList.map((pkg) => ({ value: pkg.id, label: pkg.name }))}
                placeholder="— Chọn Gói dịch vụ —"
                aria-label="Thuộc Gói dịch vụ"
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
              Tên {isPackage ? 'Gói dịch vụ' : 'Hạng mục'} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isPackage ? 'Ví dụ: Đo đạc & Cắm mốc địa chính' : 'Ví dụ: Trích lục địa chính'}
              required
              autoFocus
              style={{
                width: '100%',
                height: '42px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-default, #cbd5e1)',
                fontSize: '13.5px',
                background: 'var(--bg-card, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {!isPackage && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                Mã hạng mục (Code)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: DO_DAC, PHAP_LY..."
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-default, #cbd5e1)',
                  fontSize: '13.5px',
                  background: 'var(--bg-card, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
              Màu sắc nhận diện (Badge Color)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {PRESET_COLORS.map((c) => {
                const isSelected = color.toLowerCase() === c.hex.toLowerCase()
                return (
                  <button
                    type="button"
                    key={c.hex}
                    onClick={() => setColor(c.hex)}
                    title={c.label}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: isSelected ? '3px solid #1e293b' : '2px solid #fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      transition: 'transform 0.15s ease',
                      transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {isSelected && <Check size={16} strokeWidth={3} />}
                  </button>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title="Chọn màu tuỳ thích"
                />
                <span style={{ fontSize: '0.85rem', color: '#6b7280', fontFamily: 'monospace' }}>{color}</span>
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
              Thứ tự sắp xếp (STT)
            </label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-default, #cbd5e1)',
                fontSize: '13.5px',
                background: 'var(--bg-card, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {isEdit && (
            <div style={{ paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', borderRadius: '4px' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                  Hiển thị trong các menu chọn (Đang hoạt động)
                </span>
              </label>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmationModal
        open={showConfirmDelete}
        overlayClassName="modal-overlay--top"
        title={`Xác nhận xoá ${isPackage ? 'Gói dịch vụ' : 'Hạng mục'}`}
        description={`Bạn có chắc muốn ẩn/xoá "${name}" khỏi danh mục? Các hợp đồng cũ đã sử dụng vẫn giữ nguyên dữ liệu lịch sử.`}
        confirmLabel="Xác nhận xoá"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowConfirmDelete(false)}
      />
    </>
  )
}

