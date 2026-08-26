import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, FileUp, X } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { laLoiChuaKichHoat, loiHienThi } from '../../lib/schemaV2'
import DatePicker from '../../components/ui/DatePicker'
import FilePreviewModal from '../../components/ui/FilePreviewModal'
import './contractComposer.css'

function CustomMultiSelect({ id, values = [], onToggle, options = [], placeholder, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const daChon = values.length
  const nhan = daChon === 0
    ? 'Không thu giấy nào từ khách'
    : daChon === options.length
      ? `Đủ bộ chuẩn · ${daChon} loại`
      : `${daChon}/${options.length} loại giấy`

  return (
    <div className="custom-select-container" ref={ref}>
      <button
        id={id}
        type="button"
        className={`custom-select-trigger in ${open ? 'is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span style={{ color: daChon ? 'var(--ink)' : 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {placeholder && !daChon ? placeholder : nhan}
        </span>
        <ChevronDown size={15} className={`chevron-icon ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="custom-select-menu is-multi" role="listbox" aria-multiselectable="true">
          {options.map((opt) => {
            const chon = values.includes(opt.id)
            return (
              <button
                type="button"
                key={opt.id}
                role="option"
                aria-selected={chon}
                className={`custom-select-option ${chon ? 'is-selected' : ''}`}
                onClick={() => onToggle(opt.id)}
              >
                {chon ? <Check size={14} className="check-icon" /> : <span className="check-placeholder" />}
                <span>
                  {opt.name}
                  {opt.is_required && <em className="ctr-checklist__req"> · bắt buộc</em>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


function CustomSelect({ id, value, onChange, options = [], placeholder, disabled, className, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const normalizedOptions = useMemo(() => {
    return (options || []).map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        const val = opt.value !== undefined ? opt.value : (opt.id !== undefined ? opt.id : opt.code)
        const lbl = opt.label !== undefined ? opt.label : (opt.name !== undefined ? opt.name : val)
        return { value: String(val), label: String(lbl) }
      }
      return { value: String(opt), label: String(opt) }
    })
  }, [options])

  const selectedOption = normalizedOptions.find(o => String(o.value) === String(value))

  return (
    <div className={`custom-select-container ${className || ''}`} ref={ref}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        className={`custom-select-trigger in ${className || ''} ${open ? 'is-open' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span style={{ color: selectedOption ? 'var(--ink)' : 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.label : (placeholder || 'Chọn...')}
        </span>
        <ChevronDown size={15} className={`chevron-icon ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="custom-select-menu">
          {placeholder && (
            <button
              type="button"
              className={`custom-select-option ${!value ? 'is-selected' : ''}`}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {!value ? <Check size={14} className="check-icon" /> : <span className="check-placeholder" />}
              <span style={{ color: 'var(--ink-3)' }}>{placeholder}</span>
            </button>
          )}
          {normalizedOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`custom-select-option ${String(opt.value) === String(value) ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {String(opt.value) === String(value) ? (
                <Check size={14} className="check-icon" />
              ) : (
                <span className="check-placeholder" />
              )}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  isDirector = false,
  saving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => ({
    customer_name: '', phone: '', service_type: '', sales_source: '',
    contract_value: '', detail: '', contract_template_id: '',
    date_signed: getTodayDate(), due_date: addDays(getTodayDate(), 7),
  }))
  // Ô chọn 2 tầng Gói → Hạng mục. Lưu task_type_id (khoá), không lưu tên —
  // tên "Tách thửa" tồn tại ở cả gói Đo Vẽ lẫn Pháp Lý.
  const [danhMuc, setDanhMuc] = useState([])
  const [goiChon, setGoiChon] = useState('')
  const [hangMucChon, setHangMucChon] = useState('')
  // Bộ giấy khách cung cấp mà Giám đốc chốt ngay tại đây. Mặc định tick hết —
  // đúng bằng hành vi cũ — nên không chọn gì cũng không đổi kết quả; cái mới là
  // giờ BỎ được loại mà hồ sơ này không cần, thay vì để nó chặn K01 rồi nhân
  // viên phải nhét đại một tệp cho qua.
  const [loaiGiay, setLoaiGiay] = useState([])
  const [loaiGiayChon, setLoaiGiayChon] = useState([])
  // Ba chế độ, KHÔNG có mặc định ngầm. Người soạn phải nói rõ ý định — thiếu
  // payload không được hiểu thành "dùng bộ mặc định", vì như thế một lỗi mạng
  // hay một field quên gửi sẽ âm thầm dựng cả bộ giấy mà không ai chọn.
  const [cheDoGiay, setCheDoGiay] = useState('')
  const [khoaV2, setKhoaV2] = useState('')
  // Ưu tiên hồ sơ (Q5) — chỉ giám đốc đặt, kèm lý do khi Cao/Gấp.
  const [uuTien, setUuTien] = useState('NORMAL')
  const [uuTienLyDo, setUuTienLyDo] = useState('')
  // Khách hàng 2 loại: cá nhân (CCCD) / doanh nghiệp (MST + đại diện).
  const [loaiKhach, setLoaiKhach] = useState('individual')
  const [khachId, setKhachId] = useState('')  // id khách cũ đã chọn → ghép, không tạo trùng
  const [dinhDanh, setDinhDanh] = useState({
    tax_id: '', id_card_number: '', id_card_date: '', id_card_place: '',
    email: '', zalo_phone: '', representative_name: '', representative_role: '',
  })
  const [ketQuaTimTen, setKetQuaTimTen] = useState([])
  const [ketQuaTimMST, setKetQuaTimMST] = useState([])
  const [dangTim, setDangTim] = useState(false)
  const [dangTraCuu, setDangTraCuu] = useState(false)
  const [geoBoundary, setGeoBoundary] = useState({ provinceCode: '', provinceName: '', wardCode: '', wardName: '' })
  const [provinces, setProvinces] = useState([])
  const [wards, setWards] = useState([])
  const [missingFields, setMissingFields] = useState([])
  const [sourceFiles, setSourceFiles] = useState([])
  const [sourceFilesOpen, setSourceFilesOpen] = useState(true)
  const [sourcePreview, setSourcePreview] = useState(null)
  const [createdContractId, setCreatedContractId] = useState('')
  const bodyRef = useRef(null)
  const sourcePreviewUrlRef = useRef('')

  const closeSourcePreview = useCallback(() => {
    if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current)
    sourcePreviewUrlRef.current = ''
    setSourcePreview(null)
  }, [])

  const previewSourceFile = useCallback((file) => {
    if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current)
    const url = URL.createObjectURL(file)
    sourcePreviewUrlRef.current = url
    setSourcePreview({ fileName: file.name, mimeType: file.type, url })
  }, [])

  useEffect(() => () => {
    if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current)
  }, [])

  // Mở lại form thì trả về trạng thái trắng — form giữ lại số liệu của hợp đồng
  // vừa lưu là cách nhanh nhất để tạo nhầm một hợp đồng trùng.
  useEffect(() => {
    if (!open) return undefined
    let bo = false
    apiFetch('/api/document-register/checklist-options')
      .then((res) => {
        if (bo) return
        const ds = res?.data || []
        setLoaiGiay(ds)
        setLoaiGiayChon(ds.map(x => x.id))
      })
      .catch((loi) => {
        if (bo) return
        setLoaiGiay([]); setLoaiGiayChon([])
        // Schema V2 chưa apply: khoá phần chọn giấy và nói bằng tiếng Việt.
        // Phần còn lại của form vẫn dùng bình thường.
        setKhoaV2(laLoiChuaKichHoat(loi) ? loiHienThi(loi) : '')
      })
    return () => { bo = true }
  }, [open])

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
    setGoiChon('')
    setHangMucChon('')
    setUuTien('NORMAL')
    setUuTienLyDo('')
    setLoaiKhach('individual')
    setKhachId('')
    setDinhDanh({ tax_id: '', id_card_number: '', id_card_date: '', id_card_place: '',
      email: '', zalo_phone: '', representative_name: '', representative_role: '' })
    setKetQuaTimTen([])
    setKetQuaTimMST([])
    setSourceFiles([])
    setSourceFilesOpen(true)
    closeSourcePreview()
    setCreatedContractId('')
  }, [open, closeSourcePreview])

  // Tải cây danh mục Gói → Hạng mục một lần khi mở form.
  useEffect(() => {
    if (!open) return
    let huy = false
    apiFetch('/api/catalog/service-packages')
      .then(res => { if (!huy) setDanhMuc(res?.data || []) })
      .catch(() => {})
    return () => { huy = true }
  }, [open])

  // Tự động chọn Gói đầu tiên và Hạng mục đầu tiên của gói đó
  useEffect(() => {
    if (open && danhMuc.length > 0 && !goiChon) {
      const firstGoi = danhMuc[0]
      const goiKey = firstGoi.id || firstGoi.code
      setGoiChon(goiKey)
      if (firstGoi.task_types?.length > 0) {
        const firstTask = firstGoi.task_types[0]
        setHangMucChon(firstTask.id)
        setForm(f => ({ ...f, service_type: firstTask.name }))
      }
    }
  }, [open, danhMuc, goiChon])

  // Tự động chọn mẫu hợp đồng đầu tiên nếu có danh sách mẫu
  useEffect(() => {
    if (open && templates.length > 0 && !form.contract_template_id) {
      setForm(f => ({ ...f, contract_template_id: templates[0].id }))
    }
  }, [open, templates, form.contract_template_id])

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
    ['hangMucChon', hangMucChon],
    ['contract_template_id', form.contract_template_id],
    ['sales_source', form.sales_source],
    ['contract_value', form.contract_value],
    ['date_signed', form.date_signed],
    ['due_date', form.due_date],
    // Chế độ chọn giấy là trường BẮT BUỘC khi phần V2 đang hoạt động. Không tự
    // suy thành "dùng bộ mặc định" — người soạn phải nói rõ ý định của mình.
    ...(loaiGiay.length && !khoaV2 ? [['cheDoGiay', cheDoGiay]] : []),
  ]), [form, geoBoundary, hangMucChon, loaiGiay.length, khoaV2, cheDoGiay])

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

  const doiDinhDanh = (k) => (e) => {
    setKhachId('')
    setDinhDanh(cur => ({ ...cur, [k]: e.target.value }))
    setMissingFields(cur => cur.filter(x => x !== k))
  }

  const handleSwitchLoaiKhach = (v) => {
    if (v === loaiKhach) return
    setLoaiKhach(v)
    setKhachId('')
    setForm(cur => ({
      ...cur,
      customer_name: '',
      phone: '',
    }))
    setDinhDanh({
      tax_id: '',
      id_card_number: '',
      id_card_date: '',
      id_card_place: '',
      email: '',
      zalo_phone: '',
      representative_name: '',
      representative_role: '',
    })
    setKetQuaTimTen([])
    setKetQuaTimMST([])
    setMissingFields(cur => cur.filter(x => !['customer_name', 'phone', 'tax_id', 'id_card_number', 'representative_name'].includes(x)))
  }

  // Tìm khách cũ theo TÊN khi gõ ≥ 2 ký tự (lọc theo đúng loại khách Cá nhân/Doanh nghiệp).
  useEffect(() => {
    const q = (form.customer_name || '').trim()
    if (!open || q.length < 2 || khachId) { setKetQuaTimTen([]); return }
    let huy = false
    setDangTim(true)
    const t = setTimeout(() => {
      apiFetch(`/api/contracts/customers/search?q=${encodeURIComponent(q)}&customer_type=${loaiKhach}`)
        .then(res => { if (!huy) setKetQuaTimTen(res?.data || []) })
        .catch(() => {})
        .finally(() => { if (!huy) setDangTim(false) })
    }, 350)
    return () => { huy = true; clearTimeout(t) }
  }, [open, form.customer_name, loaiKhach, khachId])

  // Tìm doanh nghiệp cũ theo MÃ SỐ THUẾ khi gõ ≥ 2 ký tự (chỉ ở tab Doanh nghiệp).
  useEffect(() => {
    if (loaiKhach !== 'business') { setKetQuaTimMST([]); return }
    const q = (dinhDanh.tax_id || '').trim()
    if (!open || q.length < 2 || khachId) { setKetQuaTimMST([]); return }
    let huy = false
    const t = setTimeout(() => {
      apiFetch(`/api/contracts/customers/search?q=${encodeURIComponent(q)}&customer_type=business`)
        .then(res => { if (!huy) setKetQuaTimMST(res?.data || []) })
        .catch(() => {})
    }, 350)
    return () => { huy = true; clearTimeout(t) }
  }, [open, dinhDanh.tax_id, loaiKhach, khachId])

  const chonKhachCu = (kh) => {
    setKhachId(kh.id)
    setLoaiKhach(kh.customer_type || 'individual')
    setForm(cur => ({
      ...cur,
      customer_name: kh.full_name || '',
      phone: kh.phone || '',
      detail: kh.address || cur.detail,
    }))
    setDinhDanh({
      tax_id: kh.tax_id || '', id_card_number: kh.id_card_number || '',
      id_card_date: kh.id_card_date || '', id_card_place: kh.id_card_place || '',
      email: kh.email || '', zalo_phone: kh.zalo_phone || '',
      representative_name: kh.representative_name || '', representative_role: kh.representative_role || '',
    })
    setKetQuaTimTen([])
    setKetQuaTimMST([])
  }

  // Tra cứu doanh nghiệp theo MST — tự điền tên công ty + địa chỉ (tiện ích).
  const traCuuMST = async () => {
    const ma = (dinhDanh.tax_id || '').replace(/\D/g, '')
    if (ma.length < 10) return
    setDangTraCuu(true)
    try {
      const res = await apiFetch(`/api/customers/lookup-tax/${ma}`)
      const d = res?.data
      if (d?.found) {
        setForm(cur => ({ ...cur, customer_name: d.name || cur.customer_name, detail: d.address || cur.detail }))
        setMissingFields(cur => cur.filter(x => x !== 'customer_name'))
      }
    } catch { /* im lặng — gõ tay được */ }
    finally { setDangTraCuu(false) }
  }

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (saving || templatesLoading) return
    if (missingRequiredKeys.length) {
      setMissingFields(missingRequiredKeys)
      const badElement = bodyRef.current?.querySelector('.bad')
      badElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      badElement?.focus?.()
      return
    }
    // Nâng ưu tiên phải ghi lý do — chặn ở đây thay vì để backend trả 422.
    if (isDirector && uuTien !== 'NORMAL' && !uuTienLyDo.trim()) {
      setMissingFields(['uutien-lydo'])
      bodyRef.current?.querySelector('#dv-uutien-lydo')?.focus?.()
      return
    }
    // Định danh bắt buộc theo loại: doanh nghiệp cần MST + đại diện; cá nhân cần CCCD.
    const thieuDinhDanh = []
    if (loaiKhach === 'business') {
      if (!dinhDanh.tax_id.trim()) thieuDinhDanh.push('tax_id')
      if (!dinhDanh.representative_name.trim()) thieuDinhDanh.push('representative_name')
    } else {
      if (!dinhDanh.id_card_number.trim()) thieuDinhDanh.push('id_card_number')
    }
    if (thieuDinhDanh.length) {
      setMissingFields(thieuDinhDanh)
      bodyRef.current?.querySelector('.bad')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    const fullAddress = [form.detail.trim(), geoBoundary.wardName, geoBoundary.provinceName].filter(Boolean).join(', ')
    const result = await onSubmit?.({
      contract_id: code,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      service_type: form.service_type,
      contract_template_id: form.contract_template_id,
      task_type_id: hangMucChon,
      // Chỉ gửi khi thực sự tải được danh sách. Gửi mảng rỗng vì lỗi mạng sẽ bị
      // máy chủ hiểu là "cố ý không thu giấy nào" và dựng hợp đồng không có ô nào.
      // LUÔN gửi chế độ tường minh. Không dùng "thiếu field" để mang nghĩa —
      // frontend lỗi hay client cũ sẽ trông giống hệt "người dùng chọn mặc
      // định", và Hạng mục ra đời với bộ giấy chẳng ai quyết định.
      ...(cheDoGiay ? {
        document_selection_mode:
          cheDoGiay === 'MAC_DINH' ? 'DEFAULT'
            : cheDoGiay === 'THU_CONG' ? 'CUSTOM' : 'NONE',
        ...(cheDoGiay === 'THU_CONG' ? { document_template_ids: loaiGiayChon } : {}),
      } : {}),
      priority: isDirector ? uuTien : 'NORMAL',
      priority_reason: (isDirector && uuTien !== 'NORMAL') ? uuTienLyDo.trim() : null,
      customer_type: loaiKhach,
      customer_id: khachId || null,
      tax_id: dinhDanh.tax_id.trim() || null,
      id_card_number: dinhDanh.id_card_number.trim() || null,
      id_card_date: dinhDanh.id_card_date || null,
      id_card_place: dinhDanh.id_card_place.trim() || null,
      email: dinhDanh.email.trim() || null,
      zalo_phone: dinhDanh.zalo_phone.trim() || null,
      representative_name: dinhDanh.representative_name.trim() || null,
      representative_role: dinhDanh.representative_role.trim() || null,
      sales_source: form.sales_source.trim(),
      contract_value: numericValue,
      address: fullAddress,
      date_signed: form.date_signed,
      due_date: form.due_date,
      source_documents: sourceFiles,
      existing_contract_id: createdContractId || null,
    })
    if (result?.contract_id) setCreatedContractId(result.contract_id)
    if (Array.isArray(result?.failed_files)) setSourceFiles(result.failed_files)
  }, [saving, templatesLoading, missingRequiredKeys, form, geoBoundary, code, numericValue, hangMucChon, loaiGiay, loaiGiayChon, cheDoGiay, uuTien, uuTienLyDo, isDirector, loaiKhach, khachId, dinhDanh, sourceFiles, createdContractId, onSubmit])

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
            {/* Nút gạt loại khách — quyết định bộ trường định danh hiện ra. */}
            <div className="kh-loai" role="tablist">
              {[['individual', 'Cá nhân'], ['business', 'Doanh nghiệp']].map(([v, nhan]) => (
                <button key={v} type="button" role="tab" aria-selected={loaiKhach === v}
                  className={`kh-loai__nut${loaiKhach === v ? ' is-on' : ''}`}
                  onClick={() => handleSwitchLoaiKhach(v)}>{nhan}</button>
              ))}
              {khachId && <span className="kh-loai__cu">✓ Khách cũ — đã tự điền</span>}
            </div>
            <div className="row c2">
              <div style={{ position: 'relative' }}>
                <label htmlFor="kh-ten">{loaiKhach === 'business' ? 'Tên công ty' : 'Tên khách hàng'}<u>*</u></label>
                <input className={`in${getValidationClass('customer_name')}`} id="kh-ten" autoComplete="off"
                  placeholder={loaiKhach === 'business' ? 'Công ty TNHH ...' : 'Nguyễn Văn An'}
                  value={form.customer_name} onChange={handleFieldChange('customer_name')} />
                {/* Gợi ý khách cũ theo tên */}
                {ketQuaTimTen.length > 0 && (
                  <ul className="kh-goiy">
                    {ketQuaTimTen.map(kh => (
                      <li key={kh.id}><button type="button" onClick={() => chonKhachCu(kh)}>
                        <strong>{kh.full_name}</strong>
                        <small>{kh.customer_type === 'business' ? `MST ${kh.tax_id || '—'}` : `CCCD ${kh.id_card_number || '—'}`} · {kh.phone || '—'} · {kh.so_hop_dong} HĐ</small>
                      </button></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label htmlFor="kh-sdt">Số điện thoại<u>*</u></label>
                <input className={`in${getValidationClass('phone')}`} id="kh-sdt" type="tel" inputMode="numeric"
                  placeholder="0901 234 567" value={form.phone} onChange={handleFieldChange('phone')} />
              </div>
            </div>
            {loaiKhach === 'business' ? (
              <>
                <div className="row c2">
                  <div style={{ position: 'relative' }}>
                    <label htmlFor="kh-mst">Mã số thuế<u>*</u></label>
                    <div className="kh-mst-row">
                      <input className={`in${getValidationClass('tax_id')}`} id="kh-mst" inputMode="numeric" placeholder="0312345678"
                        value={dinhDanh.tax_id} onChange={doiDinhDanh('tax_id')}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); traCuuMST(); } }} />
                      <button type="button" className="kh-tracuu" disabled={dangTraCuu || (dinhDanh.tax_id || '').replace(/\D/g,'').length < 10}
                        onClick={traCuuMST}>{dangTraCuu ? '...' : 'Tra cứu'}</button>
                    </div>
                    {/* Gợi ý doanh nghiệp cũ theo MST */}
                    {ketQuaTimMST.length > 0 && (
                      <ul className="kh-goiy">
                        {ketQuaTimMST.map(kh => (
                          <li key={kh.id}><button type="button" onClick={() => chonKhachCu(kh)}>
                            <strong>{kh.full_name}</strong>
                            <small>MST {kh.tax_id || '—'} · {kh.phone || '—'} · {kh.so_hop_dong} HĐ</small>
                          </button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label htmlFor="kh-email">Email</label>
                    <input className="in" id="kh-email" type="email" placeholder="ketoan@congty.vn"
                      value={dinhDanh.email} onChange={doiDinhDanh('email')} />
                  </div>
                </div>
                <div className="row c2">
                  <div>
                    <label htmlFor="kh-dd">Người đại diện<u>*</u></label>
                    <input className={`in${getValidationClass('representative_name')}`} id="kh-dd" placeholder="Nguyễn Văn Giám"
                      value={dinhDanh.representative_name} onChange={doiDinhDanh('representative_name')} />
                  </div>
                  <div>
                    <label htmlFor="kh-cv">Chức vụ</label>
                    <input className="in" id="kh-cv" placeholder="Giám đốc"
                      value={dinhDanh.representative_role} onChange={doiDinhDanh('representative_role')} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="row c2">
                  <div>
                    <label htmlFor="kh-cccd">Số CCCD<u>*</u></label>
                    <input className={`in${getValidationClass('id_card_number')}`} id="kh-cccd" inputMode="numeric" placeholder="079300012345"
                      value={dinhDanh.id_card_number} onChange={doiDinhDanh('id_card_number')} />
                  </div>
                  <div>
                    <label htmlFor="kh-email2">Email</label>
                    <input className="in" id="kh-email2" type="email" placeholder="tuỳ chọn"
                      value={dinhDanh.email} onChange={doiDinhDanh('email')} />
                  </div>
                </div>
                <div className="row c2">
                  <div>
                    <label>Ngày cấp</label>
                    <DatePicker
                      value={dinhDanh.id_card_date}
                      onChange={(val) => setDinhDanh(cur => ({ ...cur, id_card_date: val }))}
                      placement="auto"
                      placeholder="Chọn ngày cấp"
                      className="date-picker--fill"
                    />
                  </div>
                  <div>
                    <label htmlFor="kh-noicap">Nơi cấp</label>
                    <input className="in" id="kh-noicap" placeholder="Cục CS QLHC về TTXH"
                      value={dinhDanh.id_card_place} onChange={doiDinhDanh('id_card_place')} />
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Hồ sơ khách gửi</h2><i /></div>
            <label className="ctr-source-upload" htmlFor="contract-source-documents">
              <FileUp size={19} />
              <span>
                <strong>Tài liệu khách gửi</strong>
                <small>Chọn ảnh, PDF hoặc tệp Office nhận từ Zalo; K01 sẽ phân loại sau.</small>
              </span>
              <input
                id="contract-source-documents"
                aria-label="Tài liệu khách gửi"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                onChange={event => {
                  const picked = Array.from(event.target.files || [])
                  setSourceFiles(current => {
                    const known = new Set(current.map(file => `${file.name}:${file.size}:${file.lastModified}`))
                    return [...current, ...picked.filter(file => !known.has(`${file.name}:${file.size}:${file.lastModified}`))]
                  })
                  setSourceFilesOpen(true)
                  event.target.value = ''
                }}
              />
            </label>
            {sourceFiles.length > 0 && (
              <div className="ctr-source-files">
                <button
                  type="button"
                  className="ctr-source-files__toggle"
                  aria-label={`${sourceFiles.length} tài liệu đã chọn`}
                  aria-expanded={sourceFilesOpen}
                  aria-controls="contract-source-file-list"
                  onClick={() => setSourceFilesOpen(current => !current)}
                >
                  <span>
                    <strong>{sourceFiles.length} tài liệu đã chọn</strong>
                    <small>{sourceFiles.length} tệp chờ tải lên sau khi lưu hợp đồng</small>
                  </span>
                  <ChevronDown className={sourceFilesOpen ? 'is-open' : ''} size={17} aria-hidden="true" />
                </button>
                {sourceFilesOpen && (
                  <ul id="contract-source-file-list" className="ctr-source-files__list">
                    {sourceFiles.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                        <FileUp size={16} aria-hidden="true" />
                        <span className="ctr-source-files__meta">
                          <button
                            type="button"
                            className="ctr-source-files__preview"
                            title={file.name}
                            aria-label={`Xem ${file.name}`}
                            onClick={() => previewSourceFile(file)}
                          >{file.name}</button>
                          <small>
                            {file.size < 1024 * 1024
                              ? `${Math.max(1, Math.ceil(file.size / 1024))} KB`
                              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                          </small>
                        </span>
                        <button
                          type="button"
                          className="ctr-source-files__remove"
                          aria-label={`Bỏ ${file.name}`}
                          onClick={() => setSourceFiles(current => current.filter((_, position) => position !== index))}
                        >
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Địa chỉ bất động sản</h2><i /></div>
            <div className="row c3">
              <div>
                <label htmlFor="dc-tinh">Tỉnh / Thành phố<u>*</u></label>
                <CustomSelect
                  id="dc-tinh"
                  className={getValidationClass('provinceCode').trim()}
                  placeholder="Chọn tỉnh/thành"
                  value={geoBoundary.provinceCode}
                  options={provinces.map(t => ({ value: t.code, label: t.name }))}
                  onChange={(val) => {
                    const t = provinces.find(x => String(x.code) === String(val))
                    setGeoBoundary({ provinceCode: t?.code || '', provinceName: t?.name || '', wardCode: '', wardName: '' })
                    setMissingFields(cur => cur.filter(x => x !== 'provinceCode'))
                  }}
                />
              </div>
              <div>
                <label htmlFor="dc-phuong">Phường / Xã<u>*</u></label>
                <CustomSelect
                  id="dc-phuong"
                  className={getValidationClass('wardCode').trim()}
                  disabled={!geoBoundary.provinceCode}
                  placeholder={geoBoundary.provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}
                  value={geoBoundary.wardCode}
                  options={wards.map(p => ({ value: p.code, label: p.name }))}
                  onChange={(val) => {
                    const p = wards.find(x => String(x.code) === String(val))
                    setGeoBoundary(cur => ({ ...cur, wardCode: p?.code || '', wardName: p?.name || '' }))
                    setMissingFields(cur => cur.filter(x => x !== 'wardCode'))
                  }}
                />
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
                <label htmlFor="dv-goi">Gói dịch vụ<u>*</u></label>
                <CustomSelect
                  id="dv-goi"
                  className={getValidationClass('hangMucChon').trim()}
                  value={goiChon}
                  options={danhMuc.map(g => ({ value: g.id || g.code, label: g.name }))}
                  onChange={(selectedGoiKey) => {
                    setGoiChon(selectedGoiKey)
                    const goi = danhMuc.find(g => (g.id || g.code) === selectedGoiKey)
                    if (goi?.task_types?.length > 0) {
                      const firstTask = goi.task_types[0]
                      setHangMucChon(firstTask.id)
                      setForm(f => ({ ...f, service_type: firstTask.name }))
                    } else {
                      setHangMucChon('')
                      setForm(f => ({ ...f, service_type: '' }))
                    }
                  }}
                />
              </div>
              <div>
                <label htmlFor="dv-loai">Hạng mục<u>*</u></label>
                <CustomSelect
                  id="dv-loai"
                  className={getValidationClass('hangMucChon').trim()}
                  disabled={!goiChon}
                  value={hangMucChon}
                  options={(danhMuc.find(g => (g.id || g.code) === goiChon)?.task_types || []).map(hm => ({
                    value: hm.id,
                    label: hm.name,
                  }))}
                  onChange={(id) => {
                    setHangMucChon(id)
                    const goi = danhMuc.find(g => (g.id || g.code) === goiChon)
                    const hm = goi?.task_types?.find(t => t.id === id)
                    setForm(f => ({ ...f, service_type: hm?.name || '' }))
                  }}
                />
              </div>
            </div>
            {khoaV2 && (
              <div className="row c1">
                <p className="ctr-v2-locked" role="status">{khoaV2}</p>
              </div>
            )}
            {!khoaV2 && loaiGiay.length > 0 && (
              <div className="row c1">
                <div>
                  <label>
                    Giấy tờ cần thu của khách<u>*</u>
                    <span className="ctr-badge-v2" title="Sổ giấy tờ chốt riêng cho Hạng mục này">
                      Sổ theo Hạng mục
                    </span>
                  </label>

                  {/* Ba chế độ tách bạch. Không có lựa chọn nào được tick sẵn:
                      người soạn phải nói rõ ý định, để "quên chọn" không bao giờ
                      bị hiểu thành "dùng bộ mặc định". */}
                  <div className="ctr-che-do" role="radiogroup" aria-label="Chế độ chọn giấy tờ">
                    {[
                      ['MAC_DINH', 'Dùng bộ mặc định', `${loaiGiay.filter(x => x.is_default !== false).length} loại theo gói và hạng mục`],
                      ['THU_CONG', 'Chọn thủ công', 'Tự tick từng loại giấy'],
                      ['KHONG_CAN', 'Không yêu cầu giấy tờ', 'Hạng mục này không thu giấy nào của khách'],
                    ].map(([ma, nhan, mo_ta]) => (
                      <button
                        type="button"
                        key={ma}
                        role="radio"
                        aria-checked={cheDoGiay === ma}
                        className={`ctr-che-do__o${cheDoGiay === ma ? ' is-active' : ''}`}
                        onClick={() => {
                          setCheDoGiay(ma)
                          if (ma === 'THU_CONG' && loaiGiayChon.length === 0) {
                            setLoaiGiayChon(loaiGiay.filter(x => x.is_default !== false).map(x => x.id))
                          }
                        }}
                      >
                        <strong>{nhan}</strong>
                        <span>{mo_ta}</span>
                      </button>
                    ))}
                  </div>

                  {cheDoGiay === 'THU_CONG' && (
                    <CustomMultiSelect
                      id="dv-giay"
                      options={loaiGiay}
                      values={loaiGiayChon}
                      onToggle={(id) => setLoaiGiayChon(cur => (
                        cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
                      ))}
                    />
                  )}

                  <p className="ctr-checklist__hint">
                    {cheDoGiay === 'KHONG_CAN'
                      ? 'Hạng mục ra đời với sổ trống. Vẫn thêm được từng loại giấy sau.'
                      : 'Bỏ loại giấy mà hạng mục này không cần — K01 sẽ không đòi nữa. Sau khi lập hợp đồng vẫn thêm/bỏ được.'}
                  </p>
                </div>
              </div>
            )}
            <div className="row c2">
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
                <CustomSelect
                  id="hd-mau"
                  className={getValidationClass('contract_template_id').trim()}
                  disabled={templatesLoading}
                  placeholder={templatesLoading ? 'Đang tải mẫu hợp đồng…' : 'Chọn mẫu hợp đồng'}
                  value={form.contract_template_id}
                  options={templates.map(template => ({
                    value: template.id,
                    label: `${template.name} — v${template.version}`,
                  }))}
                  onChange={(val) => {
                    setForm(f => ({ ...f, contract_template_id: val }))
                    setMissingFields(cur => cur.filter(x => x !== 'contract_template_id'))
                  }}
                />
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
            {/* Ưu tiên hồ sơ — chỉ giám đốc thấy (Q5). Đặt từ đầu, khoá khi kích hoạt. */}
            {isDirector && (
              <div className="row c2">
                <div>
                  <label htmlFor="dv-uutien">Độ ưu tiên hồ sơ</label>
                  <CustomSelect
                    id="dv-uutien"
                    value={uuTien}
                    onChange={(val) => {
                      setUuTien(val)
                      if (val === 'NORMAL') setUuTienLyDo('')
                    }}
                    options={[
                      { value: 'NORMAL', label: 'Bình thường' },
                      { value: 'HIGH', label: 'Ưu tiên cao (x1,2)' },
                      { value: 'URGENT', label: 'Gấp (x1,5)' },
                    ]}
                  />
                </div>
                {uuTien !== 'NORMAL' && (
                  <div>
                    <label htmlFor="dv-uutien-lydo">Lý do ưu tiên<u>*</u></label>
                    <input className="in" id="dv-uutien-lydo" placeholder="VD: Khách cần gấp trước 25/8"
                      value={uuTienLyDo} onChange={(e) => setUuTienLyDo(e.target.value)} />
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Thời hạn</h2><i /></div>
            <div className="row c-date">
              <div>
                <label>Ngày ký<u>*</u></label>
                <DatePicker
                  value={form.date_signed}
                  onChange={(val) => {
                    setForm(f => ({ ...f, date_signed: val }))
                    setMissingFields(cur => cur.filter(x => x !== 'date_signed'))
                  }}
                  placement="top"
                  placeholder="Chọn ngày ký"
                  className={`date-picker--fill${getValidationClass('date_signed')}`}
                />
              </div>
              <div>
                <label>Hạn hoàn thành<u>*</u></label>
                <DatePicker
                  value={form.due_date}
                  onChange={(val) => {
                    setForm(f => ({ ...f, due_date: val }))
                    setMissingFields(cur => cur.filter(x => x !== 'due_date'))
                  }}
                  placement="top"
                  placeholder="Chọn hạn hoàn thành"
                  className={`date-picker--fill${getValidationClass('due_date')}`}
                />
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
            {saving ? 'Đang lưu…' : templatesLoading ? 'Đang tải mẫu…' : createdContractId ? 'Tải lại tệp lỗi' : 'Lưu hợp đồng'}
          </button>
        </footer>

      </form>
      <FilePreviewModal
        open={Boolean(sourcePreview)}
        fileName={sourcePreview?.fileName}
        mimeType={sourcePreview?.mimeType}
        url={sourcePreview?.url}
        onClose={closeSourcePreview}
      />
    </div>,
    document.body,
  )
}
