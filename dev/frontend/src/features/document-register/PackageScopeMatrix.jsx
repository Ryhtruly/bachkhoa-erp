import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

/**
 * Chọn phạm vi áp dụng: Mọi gói · từng Gói · từng Hạng mục.
 *
 * Ba mức lồng nhau nên phải nói rõ mức nào thắng:
 *   - Tick "Mọi gói" → trùm hết, ba ô Gói mờ đi. Đây là cờ GLOBAL, dành cho giấy
 *     dùng chung toàn công ty (CCCD, hộ khẩu).
 *   - Tick một Gói mà không tick hạng mục con nào → cả gói.
 *   - Tick hạng mục con → chỉ những hạng mục đó; ô Gói cha thành trạng thái nửa
 *     vời (indeterminate) để mắt thấy ngay là chưa trùm cả gói.
 *
 * Ở chế độ Sửa, toàn bộ ô bị khoá: sửa một bản ghi gán chỉ được đổi Bước, không
 * đổi phạm vi. Đổi phạm vi là chuyển bản ghi sang nhánh khác, mà nhánh đích có
 * thể đã có bản ghi của chính loại giấy này — phải gỡ rồi khai lại để va chạm
 * lộ ra, chứ không ghi đè im lặng.
 */
export default function PackageScopeMatrix({ value, packageTree, disabled = false, onChange }) {
  const { globalAll, packageIds, taskTypeIds } = value
  const [expanded, setExpanded] = useState(() => new Set())

  const toggleExpand = (id) => setExpanded(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const togglePackage = (pkg) => {
    const on = packageIds.includes(pkg.id)
    const childIds = (pkg.task_types || []).map(type => type.id)
    onChange({
      ...value,
      packageIds: on ? packageIds.filter(id => id !== pkg.id) : [...packageIds, pkg.id],
      // Tick cả gói thì mọi hạng mục con thành thừa — giữ lại là khai hai lần
      // cùng một điều, và DB sẽ có cả dòng PACKAGE lẫn dòng TASK_TYPE chồng nhau.
      taskTypeIds: on ? taskTypeIds : taskTypeIds.filter(id => !childIds.includes(id)),
    })
  }

  const toggleTaskType = (pkg, typeId) => {
    const on = taskTypeIds.includes(typeId)
    onChange({
      ...value,
      taskTypeIds: on ? taskTypeIds.filter(id => id !== typeId) : [...taskTypeIds, typeId],
      packageIds: packageIds.filter(id => id !== pkg.id),
    })
  }

  return (
    <fieldset className="tsm" disabled={disabled}>
      <legend>Gói và hạng mục áp dụng</legend>

      <label className={`tsm__global${globalAll ? ' is-checked' : ''}`}>
        <input
          type="checkbox"
          checked={globalAll}
          onChange={(event) => onChange({
            ...value,
            globalAll: event.target.checked,
            packageIds: event.target.checked ? [] : packageIds,
            taskTypeIds: event.target.checked ? [] : taskTypeIds,
          })}
        />
        <div className="tsm__global-text">
          <span>Mọi gói <em>(toàn công ty)</em></span>
          <small>Tự động nạp cho mọi hợp đồng và hạng mục toàn hệ thống</small>
        </div>
      </label>

      <div className={`tsm__body${globalAll ? ' is-mo' : ''}`}>
        {(packageTree || []).map(pkg => {
          const childIds = (pkg.task_types || []).map(type => type.id)
          const chosenChildren = childIds.filter(id => taskTypeIds.includes(id))
          const wholePackage = packageIds.includes(pkg.id)
          const open = expanded.has(pkg.id)

          return (
            <div key={pkg.id} className={`tsm__pkg${open ? ' is-open' : ''}${wholePackage ? ' is-pkg-active' : ''}`}>
              <div className="tsm__pkg-head">
                <label className="tsm__pkg-label">
                  <input
                    type="checkbox"
                    checked={wholePackage}
                    // Nửa vời: có hạng mục con được tick nhưng không phải cả gói.
                    ref={(node) => {
                      if (node) node.indeterminate = !wholePackage && chosenChildren.length > 0
                    }}
                    disabled={globalAll}
                    onChange={() => togglePackage(pkg)}
                  />
                  <span className="tsm__pkg-title">{pkg.name}</span>
                  {wholePackage && <span className="tsm__pkg-pill is-all">Trọn gói</span>}
                  {!wholePackage && chosenChildren.length > 0 && (
                    <span className="tsm__pkg-pill is-partial">{chosenChildren.length} hạng mục</span>
                  )}
                </label>
                <button
                  type="button"
                  className="tsm__expand"
                  aria-expanded={open}
                  aria-label={`${open ? 'Thu' : 'Bung'} hạng mục của ${pkg.name}`}
                  onClick={() => toggleExpand(pkg.id)}
                >
                  <span className="tsm__expand-text">{open ? 'Thu gọn' : 'Chi tiết'}</span>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>

              {open && (
                <div className="tsm__types">
                  {(pkg.task_types || []).length === 0 && (
                    <p className="tsm__trong">Gói này chưa có hạng mục nào.</p>
                  )}
                  {(pkg.task_types || []).map(type => (
                    <label key={type.id} className={`tsm__type-item${taskTypeIds.includes(type.id) ? ' is-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={taskTypeIds.includes(type.id)}
                        disabled={globalAll || wholePackage}
                        onChange={() => toggleTaskType(pkg, type.id)}
                      />
                      <span>{type.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
