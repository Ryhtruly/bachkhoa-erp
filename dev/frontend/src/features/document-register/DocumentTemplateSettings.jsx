import { useCallback, useEffect, useState } from 'react'
import { Archive, ChevronRight, FileStack, Plus, Power, Save, Search } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import { apiFetch } from '../../lib/api'
import './documentRegister.css'

const EMPTY = {
  id: null,
  task_type_id: '',
  name: '',
  source: 'KHACH_HANG',
  is_required: true,
  needs_original: false,
  default_quantity: 1,
  sort_order: 100,
  note: '',
  is_active: true,
}

const EMPTY_PLACE = { id: null, name: '', kind: 'TAI_CHO', sort_order: 100, implies_status: '' }

const SLOT_STATUS_OPTIONS = [
  { value: '', label: '— Không ngụ ý trạng thái nào —' },
  { value: 'DA_NHAN', label: 'Đã nhận' },
  { value: 'DA_KY', label: 'Đã ký' },
  { value: 'DA_SCAN', label: 'Đã scan' },
  { value: 'DA_NOP', label: 'Đã nộp' },
  { value: 'BI_TRA_LAI', label: 'Được trả lại' },
]

/**
 * Cấu hình bộ mẫu giấy tờ theo Dạng hồ sơ.
 *
 * Đây là chỗ Giám đốc quyết định mỗi thủ tục đòi những tờ gì. Sổ giấy tờ của
 * mọi hợp đồng mới đổ ra từ đây, nên sửa ở đây là sửa cho tương lai — hồ sơ
 * đang chạy giữ nguyên bộ giấy đã đổ lúc mở sổ.
 */
export default function DocumentTemplateSettings() {
  const { addToast } = useToast() || {}
  // Mặc định chỉ mở "Bộ chung" — đó là bộ mọi hợp đồng đều dùng. Hơn hai mươi
  // thủ tục bung hết ra cùng lúc thì trang dài mấy màn hình và không đọc được
  // gì; muốn xem thủ tục nào thì mở đúng thủ tục đó.
  const [nhomMo, setNhomMo] = useState(() => new Set(['chung']))
  const [tuKhoa, setTuKhoa] = useState('')
  const [moNoiLuu, setMoNoiLuu] = useState(false)
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [places, setPlaces] = useState([])
  const [editingPlace, setEditingPlace] = useState(null)

  const load = useCallback(async () => {
    try {
      const [payload, placePayload] = await Promise.all([
        apiFetch('/api/document-register/templates'),
        apiFetch('/api/document-register/storage-locations'),
      ])
      setData(payload?.data || null)
      setPlaces(placePayload?.data || [])
    } catch (requestError) {
      addToast?.(requestError.message || 'Không tải được bộ mẫu.', 'error')
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/document-register/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editing, task_type_id: editing.task_type_id || null }),
      })
      addToast?.('Đã lưu vào mẫu', 'success')
      setEditing(null)
      await load()
    } catch (saveError) {
      addToast?.(saveError.message || 'Không lưu được.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (item) => {
    if (!window.confirm(
      `Tắt “${item.name}” khỏi mẫu?\n\n`
      + `${item.in_use} hồ sơ đang dùng mục này vẫn giữ nguyên — chỉ hợp đồng mới `
      + 'là không còn đòi tờ giấy này nữa.'
    )) return
    try {
      await apiFetch(`/api/document-register/templates/${item.id}`, { method: 'DELETE' })
      addToast?.('Đã tắt khỏi mẫu', 'success')
      await load()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không tắt được.', 'error')
    }
  }

  const savePlace = async (event) => {
    event.preventDefault()
    try {
      await apiFetch('/api/document-register/storage-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingPlace, implies_status: editingPlace.implies_status || null }),
      })
      addToast?.('Đã lưu nơi lưu', 'success')
      setEditingPlace(null)
      await load()
    } catch (saveError) {
      addToast?.(saveError.message || 'Không lưu được.', 'error')
    }
  }

  const deactivatePlace = async (place) => {
    if (!window.confirm(
      `Tắt “${place.name}” khỏi danh mục?\n\n`
      + 'Hồ sơ đang trỏ vào nơi này vẫn giữ nguyên — chỉ là không chọn mới được nữa.'
    )) return
    try {
      await apiFetch(`/api/document-register/storage-locations/${place.id}`, { method: 'DELETE' })
      addToast?.('Đã tắt khỏi danh mục', 'success')
      await load()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không tắt được.', 'error')
    }
  }

  const groups = data?.groups || []
  const khoaNhom = (group) => group.task_type_id || 'chung'

  // Lọc theo tên giấy. Nhóm nào không còn dòng nào khớp thì ẩn hẳn — để lại một
  // tiêu đề nhóm rỗng chỉ làm người ta tưởng còn phải mở ra xem.
  const tim = tuKhoa.trim().toLowerCase()
  const nhomHienThi = (tim
    ? groups
      .map(g => ({ ...g, items: g.items.filter(x => x.name.toLowerCase().includes(tim)) }))
      .filter(g => g.items.length > 0)
    : groups)

  const dangMo = (group) => (tim ? true : nhomMo.has(khoaNhom(group)))
  const toggleNhom = (group) => setNhomMo((cu) => {
    const moi = new Set(cu)
    const k = khoaNhom(group)
    if (moi.has(k)) moi.delete(k); else moi.add(k)
    return moi
  })

  const tongSoGiay = groups.reduce((t, g) => t + g.items.length, 0)

  return <section className="tab-pane active dts list-page-frame" aria-label="Mẫu giấy tờ">
    {/* Cùng một khung tiêu đề với Hồ Sơ Đo Vẽ và Hồ Sơ Pháp Lý — cùng chiều cao,
        cùng nền, cùng con số trong chip. Màn này trước đây tự bày một tiêu đề
        riêng nên đứng cạnh các tab khác là thấy lạc nhịp ngay. */}
    <header className="contract-pane-title">
      <div>
        <FileStack size={20} style={{ color: 'var(--orange-500)' }} />
        <span>Mẫu Giấy Tờ</span>
        <strong>{tongSoGiay}</strong>
      </div>
      <div className="dts-head__tools">
        <div className="dts-search">
          <Search size={14} />
          <input
            type="search"
            value={tuKhoa}
            onChange={(event) => setTuKhoa(event.target.value)}
            placeholder="Tìm tên giấy tờ…"
            aria-label="Tìm tên giấy tờ trong bộ mẫu"
          />
        </div>
        <button
          type="button"
          className="dts-new"
          onClick={() => setEditing({ ...EMPTY })}
        >
          <Plus size={15} /> Thêm giấy tờ vào mẫu
        </button>
      </div>
    </header>

    <p className="dts-hint">
      Hợp đồng mới đổ sổ giấy tờ từ bộ mẫu này — sửa ở đây là <strong>sửa cho hồ sơ
      tương lai</strong>, hồ sơ đang chạy giữ nguyên bộ giấy đã đổ lúc mở sổ.
    </p>

    {/* Khung trang cao cố định và overflow:hidden như Đo Vẽ / Pháp Lý, nên phần
        chạy được phải nằm trong đúng một vùng cuộn — tiêu đề và ghi chú đứng yên. */}
    <div className="dts-scroll">

    {editing && <form className="dts-form" onSubmit={save}>
      <div className="dts-form__row">
        <label>
          Áp cho thủ tục
          <select
            value={editing.task_type_id || ''}
            onChange={(event) => setEditing({ ...editing, task_type_id: event.target.value })}
          >
            <option value="">— Bộ chung (mọi thủ tục) —</option>
            {(data?.task_types || []).map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </label>

        <label className="is-wide">
          Tên giấy tờ
          <input
            value={editing.name}
            required
            placeholder="Ví dụ: Đơn đăng ký biến động đất đai (09/ĐK)"
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
          />
        </label>

        <label>
          Nguồn
          <select
            value={editing.source}
            onChange={(event) => setEditing({ ...editing, source: event.target.value })}
          >
            <option value="KHACH_HANG">Khách hàng cung cấp</option>
            <option value="CONG_TY">Công ty soạn/lập</option>
            <option value="CO_QUAN">Cơ quan Nhà nước trả</option>
          </select>
        </label>
      </div>

      <div className="dts-form__row">
        <label className="is-check">
          <input
            type="checkbox"
            checked={editing.is_required}
            onChange={(event) => setEditing({ ...editing, is_required: event.target.checked })}
          />
          Bắt buộc
        </label>
        <label className="is-check">
          <input
            type="checkbox"
            checked={editing.needs_original}
            onChange={(event) => setEditing({ ...editing, needs_original: event.target.checked })}
          />
          Cần bản chính
        </label>
        <label className="is-small">
          Số lượng
          <input
            type="number"
            min="1"
            value={editing.default_quantity}
            onChange={(event) => setEditing({ ...editing, default_quantity: Number(event.target.value) })}
          />
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
          <button type="submit" className="dts-save" disabled={saving}>
            <Save size={14} /> {saving ? 'Đang lưu…' : 'Lưu vào mẫu'}
          </button>
        </div>
      </div>

      {editing.is_required && (
        <p className="dts-warn">
          ⚠️ Giấy <strong>bắt buộc</strong> thì hồ sơ thiếu nó sẽ không nộp nghiệm thu được.
          Chỉ tick khi thủ tục thật sự đòi.
        </p>
      )}
    </form>}

    {!data && <p className="dts-empty">Đang tải bộ mẫu…</p>}

    <div className="dts-list">
      {/* MỘT hàng tiêu đề cho cả danh sách, dính khi cuộn. Trước đây mỗi nhóm
          tự kê lại đủ sáu cột, hai mươi nhóm là hai mươi lần lặp — mắt không
          còn phân biệt được đâu là nhóm mới, đâu là tiêu đề cũ. */}
      <div className="dts-list__head">
        <span>Giấy tờ</span>
        <span>Nguồn</span>
        <span className="is-mid">Bắt buộc</span>
        <span className="is-mid">Bản chính</span>
        <span className="is-mid">SL</span>
        <span className="is-mid">Đang dùng</span>
        <span />
      </div>

      {nhomHienThi.map(group => {
        const mo = dangMo(group)
        const soBatBuoc = group.items.filter(x => x.is_required).length
        const soDangDung = group.items.reduce((t, x) => t + (x.in_use || 0), 0)
        return (
          <div key={khoaNhom(group)} className={`dts-group${mo ? ' is-open' : ''}`}>
            <button
              type="button"
              className="dts-group__head"
              aria-expanded={mo}
              onClick={() => toggleNhom(group)}
            >
              <ChevronRight size={15} className="dts-group__caret" />
              <strong>{group.task_type_name}</strong>
              <span className="dts-group__meta">
                {group.items.length} giấy
                {soBatBuoc > 0 && <em> · {soBatBuoc} bắt buộc</em>}
                {soDangDung > 0 && <i> · {soDangDung} hồ sơ đang dùng</i>}
              </span>
            </button>

            {mo && group.items.map(item => (
              <div key={item.id} className={`dts-row${item.is_active ? '' : ' is-off'}`}>
                <span className="dts-row__name">
                  {item.name}
                  {!item.is_active && <span className="dr-tag">đã tắt</span>}
                </span>
                <span className="dts-row__source">{item.source_label}</span>
                <span className="is-mid">{item.is_required ? <b className="dts-yes">✓</b> : '—'}</span>
                <span className="is-mid">{item.needs_original ? <b className="dts-yes">✓</b> : '—'}</span>
                <span className="is-mid">{item.default_quantity}</span>
                {/* Số hồ sơ đang dùng là thứ Giám đốc phải thấy trước khi tắt một
                    mục: tắt mẫu KHÔNG gỡ giấy khỏi hồ sơ đang chạy. */}
                <span className="is-mid">{item.in_use > 0
                  ? <b className="dts-inuse">{item.in_use}</b>
                  : <span className="dts-zero">0</span>}</span>
                <span className="dts-row-actions">
                  <button
                    type="button"
                    onClick={() => setEditing({
                      ...item,
                      task_type_id: group.task_type_id || '',
                      note: item.note || '',
                    })}
                  >
                    Sửa
                  </button>
                  {item.is_active && (
                    <button type="button" className="is-off" onClick={() => deactivate(item)} title="Tắt khỏi mẫu">
                      <Power size={13} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )
      })}

      {tim && nhomHienThi.length === 0 && (
        <p className="dts-empty">Không có giấy tờ nào khớp “{tuKhoa}”.</p>
      )}
    </div>


    {/* Nơi lưu bản cứng là cấu hình của cấu hình — sửa vài tháng một lần. Để nó
        chiếm trọn màn hình đầu thì thứ người ta vào đây để xem (bộ giấy tờ) bị
        đẩy xuống dưới màn thứ hai. */}
    <div className={`dts-places${moNoiLuu ? ' is-open' : ''}`}>
      <button
        type="button"
        className="dts-places__toggle"
        aria-expanded={moNoiLuu}
        onClick={() => setMoNoiLuu(v => !v)}
      >
        <ChevronRight size={15} className="dts-group__caret" />
        <Archive size={15} />
        <strong>Danh mục nơi lưu bản cứng</strong>
        <span className="dts-group__meta">{places.length} nơi</span>
      </button>
      {moNoiLuu && <div className="dts-places__body">

      <h3><Archive size={16} /> Danh mục nơi lưu bản cứng
        <button type="button" onClick={() => setEditingPlace({ ...EMPTY_PLACE })}>
          <Plus size={13} /> Thêm nơi lưu
        </button>
      </h3>

      <p className="dts-hint">
        Nhân viên chọn từ danh mục này thay vì gõ tay — “Tủ 1”, “tủ A”, “kệ 2 ngăn 3”
        gõ tự do sẽ thành ba nơi khác nhau của cùng một chỗ.
      </p>

      {editingPlace && <form className="dts-form" onSubmit={savePlace}>
        <div className="dts-form__row">
          <label className="is-wide">
            Tên nơi lưu
            <input
              value={editingPlace.name}
              required
              placeholder="Ví dụ: Tủ hồ sơ D"
              onChange={(event) => setEditingPlace({ ...editingPlace, name: event.target.value })}
            />
          </label>
          <label>
            Loại
            <select
              value={editingPlace.kind}
              onChange={(event) => setEditingPlace({ ...editingPlace, kind: event.target.value })}
            >
              <option value="TAI_CHO">Trong kho công ty</option>
              <option value="BEN_NGOAI">Không ở công ty</option>
            </select>
          </label>
          <label>
            Ngụ ý trạng thái
            <select
              value={editingPlace.implies_status || ''}
              onChange={(event) => setEditingPlace({ ...editingPlace, implies_status: event.target.value })}
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
              value={editingPlace.sort_order}
              onChange={(event) => setEditingPlace({ ...editingPlace, sort_order: Number(event.target.value) })}
            />
          </label>
          <div className="dts-form__actions">
            <button type="button" className="dts-cancel" onClick={() => setEditingPlace(null)}>Huỷ</button>
            <button type="submit" className="dts-save"><Save size={14} /> Lưu</button>
          </div>
        </div>
        <p className="dts-warn">
          “Ngụ ý trạng thái” dùng để nhắc khi sổ ghi mâu thuẫn — ví dụ chọn
          <strong> Đang ở cơ quan</strong> mà trạng thái vẫn là “Đã nhận”.
          Hệ thống chỉ nhắc, không tự đổi.
        </p>
      </form>}

      <table className="dr-table">
        <thead>
          <tr><th>Nơi lưu</th><th>Loại</th><th>Ngụ ý trạng thái</th><th /></tr>
        </thead>
        <tbody>
          {places.map(place => <tr key={place.id}>
            <td className="dr-name">{place.name}</td>
            <td>{place.is_external ? 'Không ở công ty' : 'Trong kho công ty'}</td>
            <td>{place.implies_status_label || '—'}</td>
            <td className="dts-row-actions">
              <button type="button" onClick={() => setEditingPlace({
                ...place, implies_status: place.implies_status || '',
              })}>Sửa</button>
              <button type="button" className="is-off" onClick={() => deactivatePlace(place)} title="Tắt khỏi danh mục">
                <Power size={13} />
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
      </div>}
    </div>
    </div>
  </section>
}
