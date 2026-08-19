import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './contractComposer.css'

/**
 * Form soạn hợp đồng mới.
 *
 * Dựng theo bản thiết kế, nhưng chạy trên dữ liệu thật của hệ thống:
 * tỉnh/phường lấy từ API địa giới, danh mục dịch vụ từ cấu hình, mã hợp đồng do
 * máy chủ cấp trước khi mở form.
 *
 * Ba thứ form này làm mà form cũ không có:
 *   1. Đọc số tiền thành chữ ngay khi gõ — số tiền là chỗ dễ gõ thừa/thiếu một
 *      số 0 nhất, và người ta chỉ phát hiện khi đọc thành chữ.
 *   2. Đếm số trường bắt buộc còn thiếu ở chân form, thay vì để người dùng bấm
 *      Lưu rồi mới biết.
 *   3. Khoảng cách giữa ngày ký và hạn hoàn thành hiện ngay cạnh hai ô ngày, và
 *      cảnh báo khi hạn rơi vào trước ngày ký.
 */

const getTodayDate = () => new Date().toISOString().split('T')[0]

const addDays = (iso, daysCount) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + daysCount)
  return d.toISOString().split('T')[0]
}

// ── Đọc số thành chữ ─────────────────────────────────────────────
const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

function readThreeDigits(n, isFull) {
  const hundreds = Math.floor(n / 100)
  const tens = Math.floor((n % 100) / 10)
  const units = n % 10
  let s = ''
  if (hundreds > 0 || isFull) {
    s += `${DIGIT_WORDS[hundreds]} trăm`
    if (tens === 0 && units > 0) s += ' lẻ'
  }
  if (tens > 1) {
    s += ` ${DIGIT_WORDS[tens]} mươi`
    if (units === 1) s += ' mốt'
    else if (units === 5) s += ' lăm'
    else if (units > 0) s += ` ${DIGIT_WORDS[units]}`
  } else if (tens === 1) {
    s += ' mười'
    if (units === 5) s += ' lăm'
    else if (units > 0) s += ` ${DIGIT_WORDS[units]}`
  } else if (units > 0) {
    s += ` ${DIGIT_WORDS[units]}`
  }
  return s.trim()
}

export function spellCurrencyWords(n) {
  if (!n) return ''
  const unitNames = ['', 'nghìn', 'triệu', 'tỷ']
  const groups = []
  let x = n
  while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000) }
  const parts = []
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (!groups[i]) continue
    parts.push(readThreeDigits(groups[i], i < groups.length - 1) + (unitNames[i] ? ` ${unitNames[i]}` : ''))
  }
  const s = parts.join(' ')
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`
}

const parseNumericString = (v) => Number(String(v).replace(/\D/g, '')) || 0

// Gõ tắt theo cách người làm nghề vẫn nói: "5tr", "18.5tr", "500k", "1,2 tỷ".
// Gõ đủ 18500000 vừa lâu vừa dễ thừa một số 0 mà mắt không bắt được.
const UNIT_MULTIPLIERS = [
  [/^([\d.,]+)\s*(?:k|ng[àa]n|ngh[ìi]n)$/i, 1e3],
  [/^([\d.,]+)\s*(?:tr|tri[ệe]u|m)$/i, 1e6],
  [/^([\d.,]+)\s*(?:t[ỷy]|b)$/i, 1e9],
]

/** Đọc chuỗi người dùng gõ thành số tiền. Trả null khi chưa gõ xong. */
export function parseShorthandCurrency(input) {
  const s = String(input).trim()
  if (!s) return 0
  for (const [pattern, multiplier] of UNIT_MULTIPLIERS) {
    const m = s.match(pattern)
    if (m) {
      // "18.5tr" và "18,5tr" đều là mười tám phẩy năm triệu; dấu chấm ở đây là
      // dấu thập phân chứ không phải dấu phân nhóm hàng nghìn.
      const num = Number(m[1].replace(/\./g, '.').replace(/,/g, '.'))
      return Number.isFinite(num) ? Math.round(num * multiplier) : null
    }
  }
  if (/[^\d.\s]/.test(s)) return null   // còn chữ lạ — người dùng đang gõ dở
  return Number(s.replace(/\D/g, '')) || 0
}

const QUICK_DENOMINATIONS = [
  { label: '+1 triệu', value: 1e6 },
  { label: '+5 triệu', value: 5e6 },
  { label: '+10 triệu', value: 1e7 },
]

export default function ContractComposer({
  open,
  code,
  services = [],
  templates = [],
  templatesLoading = false,
  templatesError = '',
  saving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => ({
    customer_name: '', phone: '', service_type: '', sales_source: '',
    contract_value: '', detail: '', contract_template_id: '',
    date_signed: getTodayDate(), due_date: addDays(getTodayDate(), 7),
  }))
  const [geoBoundary, setGeoBoundary] = useState({ provinceCode: '', provinceName: '', wardCode: '', wardName: '' })
  const [provinces, setProvinces] = useState([])
  const [wards, setWards] = useState([])
  const [missingFields, setMissingFields] = useState([])
  const bodyRef = useRef(null)

  // Mở lại form thì trả về trạng thái trắng — form giữ lại số liệu của hợp đồng
  // vừa lưu là cách nhanh nhất để tạo nhầm một hợp đồng trùng.
  useEffect(() => {
    if (!open) return
    setForm({
      customer_name: '', phone: '', service_type: '', sales_source: '',
      contract_value: '', detail: '', contract_template_id: '',
      date_signed: getTodayDate(), due_date: addDays(getTodayDate(), 7),
    })
    setGeoBoundary({ provinceCode: '', provinceName: '', wardCode: '', wardName: '' })
    setWards([])
    setMissingFields([])
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    fetch('/api/survey-records/wards/provinces')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setProvinces(Array.isArray(d) ? d : (d.data || [])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!geoBoundary.provinceCode) { setWards([]); return undefined }
    let cancelled = false
    fetch(`/api/survey-records/wards?province_code=${encodeURIComponent(geoBoundary.provinceCode)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setWards(Array.isArray(d) ? d : (d.data || [])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [geoBoundary.provinceCode])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const requiredFields = useMemo(() => ([
    ['customer_name', form.customer_name],
    ['phone', form.phone],
    ['provinceCode', geoBoundary.provinceCode],
    ['wardCode', geoBoundary.wardCode],
    ['service_type', form.service_type],
    ['contract_template_id', form.contract_template_id],
    ['sales_source', form.sales_source],
    ['contract_value', form.contract_value],
    ['date_signed', form.date_signed],
    ['due_date', form.due_date],
  ]), [form, geoBoundary])

  const missingRequiredKeys = requiredFields.filter(([, v]) => !String(v || '').trim()).map(([k]) => k)
  const numericValue = parseNumericString(form.contract_value)

  const daysSpan = useMemo(() => {
    const a = new Date(form.date_signed)
    const b = new Date(form.due_date)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
    return Math.round((b - a) / 864e5)
  }, [form.date_signed, form.due_date])

  const handleFieldChange = (key) => (e) => {
    setForm(cur => ({ ...cur, [key]: e.target.value }))
    setMissingFields(cur => cur.filter(x => x !== key))
  }

  // Trong lúc gõ thì giữ nguyên chữ người dùng đang gõ ("18.5t" chưa đủ để biết
  // là triệu hay tỷ). Chỉ chuẩn hoá khi đã đọc ra được số, hoặc khi rời ô.
  const handleCurrencyChange = (e) => {
    const raw = e.target.value.slice(0, 24)
    const num = parseShorthandCurrency(raw)
    setForm(cur => ({
      ...cur,
      contract_value: num === null ? raw : (num ? num.toLocaleString('vi-VN') : ''),
    }))
    setMissingFields(cur => cur.filter(x => x !== 'contract_value'))
  }

  const handleCurrencyBlur = () => {
    const num = parseShorthandCurrency(form.contract_value)
    setForm(cur => ({ ...cur, contract_value: num ? num.toLocaleString('vi-VN') : '' }))
  }

  const handleAddQuickAmount = (amountToAdd) => {
    const num = Math.min(parseNumericString(form.contract_value) + amountToAdd, 999999999999999)
    setForm(cur => ({ ...cur, contract_value: num.toLocaleString('vi-VN') }))
    setMissingFields(cur => cur.filter(x => x !== 'contract_value'))
  }

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (saving || templatesLoading) return
    if (missingRequiredKeys.length) {
      setMissingFields(missingRequiredKeys)
      const badElement = bodyRef.current?.querySelector('.bad')
      badElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      badElement?.focus?.()
      return
    }
    const fullAddress = [form.detail.trim(), geoBoundary.wardName, geoBoundary.provinceName].filter(Boolean).join(', ')
    onSubmit?.({
      contract_id: code,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      service_type: form.service_type,
      contract_template_id: form.contract_template_id,
      sales_source: form.sales_source.trim(),
      contract_value: numericValue,
      address: fullAddress,
      date_signed: form.date_signed,
      due_date: form.due_date,
    })
  }, [saving, missingRequiredKeys, form, geoBoundary, code, numericValue, onSubmit])

  if (!open) return null

  const getValidationClass = (k) => (missingFields.includes(k) ? ' bad' : '')

  return createPortal(
    <div className="ctr-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose?.() }}>
      <form className="ctr-form" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="Soạn hợp đồng mới">

        <header className="hd">
          <div className="ic">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M10 13l3 3-1 3-3-1 1-5z" />
            </svg>
          </div>
          <div>
            <h1>Soạn hợp đồng mới</h1>
            <p>Điền thông tin và lưu hợp đồng vào hệ thống</p>
          </div>
          <div className="code"><b>Mã HĐ</b>{code || '—'}</div>
          <button className="x" type="button" aria-label="Đóng" onClick={() => !saving && onClose?.()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="bd" ref={bodyRef}>

          <section className="sec">
            <div className="sec-hd"><h2>Khách hàng</h2><i /></div>
            <div className="row c2">
              <div>
                <label htmlFor="kh-ten">Tên khách hàng<u>*</u></label>
                <input className={`in${getValidationClass('customer_name')}`} id="kh-ten" placeholder="Nguyễn Văn An"
                  value={form.customer_name} onChange={handleFieldChange('customer_name')} />
              </div>
              <div>
                <label htmlFor="kh-sdt">Số điện thoại<u>*</u></label>
                <input className={`in${getValidationClass('phone')}`} id="kh-sdt" type="tel" inputMode="numeric"
                  placeholder="0901 234 567" value={form.phone} onChange={handleFieldChange('phone')} />
              </div>
            </div>
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Địa chỉ bất động sản</h2><i /></div>
            <div className="row c3">
              <div>
                <label htmlFor="dc-tinh">Tỉnh / Thành phố<u>*</u></label>
                <select className={getValidationClass('provinceCode').trim()} id="dc-tinh" value={geoBoundary.provinceCode}
                  onChange={(e) => {
                    const t = provinces.find(x => String(x.code) === e.target.value)
                    setGeoBoundary({ provinceCode: t?.code || '', provinceName: t?.name || '', wardCode: '', wardName: '' })
                    setMissingFields(cur => cur.filter(x => x !== 'provinceCode'))
                  }}>
                  <option value="">Chọn tỉnh/thành</option>
                  {provinces.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dc-phuong">Phường / Xã<u>*</u></label>
                <select className={getValidationClass('wardCode').trim()} id="dc-phuong" disabled={!geoBoundary.provinceCode}
                  value={geoBoundary.wardCode}
                  onChange={(e) => {
                    const p = wards.find(x => String(x.code) === e.target.value)
                    setGeoBoundary(cur => ({ ...cur, wardCode: p?.code || '', wardName: p?.name || '' }))
                    setMissingFields(cur => cur.filter(x => x !== 'wardCode'))
                  }}>
                  <option value="">{geoBoundary.provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}</option>
                  {wards.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dc-duong">Số nhà, đường<small>không bắt buộc</small></label>
                <input className="in" id="dc-duong" placeholder="12 Nguyễn Huệ"
                  value={form.detail} onChange={handleFieldChange('detail')} />
              </div>
            </div>
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Dịch vụ &amp; giá trị</h2><i /></div>
            <div className="row c2">
              <div>
                <label htmlFor="dv-loai">Dịch vụ<u>*</u></label>
                <select className={getValidationClass('service_type').trim()} id="dv-loai"
                  value={form.service_type} onChange={handleFieldChange('service_type')}>
                  <option value="">Chọn dịch vụ</option>
                  {services.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dv-sale">Sale / nguồn<u>*</u></label>
                <input className={`in${getValidationClass('sales_source')}`} id="dv-sale" placeholder="Trần Minh"
                  value={form.sales_source} onChange={handleFieldChange('sales_source')} />
              </div>
            </div>
            {templatesError && <p className="hint" role="alert">{templatesError}</p>}
            <div className="row">
              <div>
                <label htmlFor="hd-mau">Mẫu hợp đồng<u>*</u></label>
                <select className={getValidationClass('contract_template_id').trim()} id="hd-mau"
                  value={form.contract_template_id} disabled={templatesLoading}
                  onChange={handleFieldChange('contract_template_id')}>
                  <option value="">{templatesLoading ? 'Đang tải mẫu hợp đồng…' : 'Chọn mẫu hợp đồng'}</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} — v{template.version}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row">
              <div className="tien">
                <label htmlFor="dv-gia">Giá trị hợp đồng<u>*</u><small>gõ tắt được: 18.5tr, 500k</small></label>
                <div className="wrap">
                  <input className={`in money${getValidationClass('contract_value')}`} id="dv-gia" inputMode="decimal"
                    autoComplete="off" placeholder="0" value={form.contract_value}
                    onChange={handleCurrencyChange} onBlur={handleCurrencyBlur} />
                  <span className="suf">₫</span>
                </div>
                <p className="hint">{numericValue > 0 && <b>{spellCurrencyWords(numericValue)}</b>}</p>
                {/* Hợp đồng ở đây gần như luôn là số tròn triệu — bấm nhanh hơn gõ. */}
                <div className="quick">
                  {QUICK_DENOMINATIONS.map(m => (
                    <button key={m.value} type="button" onClick={() => handleAddQuickAmount(m.value)}>{m.label}</button>
                  ))}
                  {numericValue > 0 && (
                    <button type="button" className="is-clear"
                      onClick={() => setForm(cur => ({ ...cur, contract_value: '' }))}>Xoá</button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Thời hạn</h2><i /></div>
            <div className="row c-date">
              <div>
                <label htmlFor="th-ky">Ngày ký<u>*</u></label>
                <input className={`in${getValidationClass('date_signed')}`} id="th-ky" type="date"
                  value={form.date_signed} onChange={handleFieldChange('date_signed')} />
              </div>
              <div>
                <label htmlFor="th-han">Hạn hoàn thành<u>*</u></label>
                <input className={`in${getValidationClass('due_date')}`} id="th-han" type="date"
                  value={form.due_date} onChange={handleFieldChange('due_date')} />
              </div>
              {daysSpan !== null && (
                <div className={`span${daysSpan < 0 ? ' is-bad' : ''}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  <span>{daysSpan < 0 ? 'Hạn trước ngày ký' : daysSpan === 0 ? 'Trong ngày' : `${daysSpan} ngày`}</span>
                </div>
              )}
            </div>
          </section>

        </div>

        <footer className="ft">
          <div className={`stat${missingRequiredKeys.length === 0 ? ' done' : ''}`}>
            <i className="dot" />
            <span>
              {missingRequiredKeys.length === 0
                ? <>Đã điền đủ <b>{requiredFields.length}/{requiredFields.length}</b> trường bắt buộc</>
                : <>Còn thiếu <b>{missingRequiredKeys.length}</b> trường bắt buộc</>}
            </span>
          </div>
          <button className="btn" type="button" disabled={saving} onClick={() => onClose?.()}>Huỷ</button>
          <button className="btn pri" type="submit" disabled={saving || templatesLoading}>
            {saving ? 'Đang lưu…' : templatesLoading ? 'Đang tải mẫu…' : 'Lưu hợp đồng'}
          </button>
        </footer>

      </form>
    </div>,
    document.body,
  )
}
