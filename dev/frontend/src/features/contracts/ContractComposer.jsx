import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '../../lib/api'
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

const ngayHomNay = () => new Date().toISOString().split('T')[0]

const congNgay = (iso, songay) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + songay)
  return d.toISOString().split('T')[0]
}

// ── Đọc số thành chữ ─────────────────────────────────────────────
const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

function docBaChuSo(n, dayDu) {
  const tram = Math.floor(n / 100)
  const chuc = Math.floor((n % 100) / 10)
  const donvi = n % 10
  let s = ''
  if (tram > 0 || dayDu) {
    s += `${CHU_SO[tram]} trăm`
    if (chuc === 0 && donvi > 0) s += ' lẻ'
  }
  if (chuc > 1) {
    s += ` ${CHU_SO[chuc]} mươi`
    if (donvi === 1) s += ' mốt'
    else if (donvi === 5) s += ' lăm'
    else if (donvi > 0) s += ` ${CHU_SO[donvi]}`
  } else if (chuc === 1) {
    s += ' mười'
    if (donvi === 5) s += ' lăm'
    else if (donvi > 0) s += ` ${CHU_SO[donvi]}`
  } else if (donvi > 0) {
    s += ` ${CHU_SO[donvi]}`
  }
  return s.trim()
}

export function docSoThanhChu(n) {
  if (!n) return ''
  const donvi = ['', 'nghìn', 'triệu', 'tỷ']
  const nhom = []
  let x = n
  while (x > 0) { nhom.push(x % 1000); x = Math.floor(x / 1000) }
  const phan = []
  for (let i = nhom.length - 1; i >= 0; i -= 1) {
    if (!nhom[i]) continue
    phan.push(docBaChuSo(nhom[i], i < nhom.length - 1) + (donvi[i] ? ` ${donvi[i]}` : ''))
  }
  const s = phan.join(' ')
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`
}

const soTuChuoi = (v) => Number(String(v).replace(/\D/g, '')) || 0

// Gõ tắt theo cách người làm nghề vẫn nói: "5tr", "18.5tr", "500k", "1,2 tỷ".
// Gõ đủ 18500000 vừa lâu vừa dễ thừa một số 0 mà mắt không bắt được.
const HE_SO = [
  [/^([\d.,]+)\s*(?:k|ng[àa]n|ngh[ìi]n)$/i, 1e3],
  [/^([\d.,]+)\s*(?:tr|tri[ệe]u|m)$/i, 1e6],
  [/^([\d.,]+)\s*(?:t[ỷy]|b)$/i, 1e9],
]

/** Đọc chuỗi người dùng gõ thành số tiền. Trả null khi chưa gõ xong. */
export function docTienGo(chuoi) {
  const s = String(chuoi).trim()
  if (!s) return 0
  for (const [mau, he] of HE_SO) {
    const m = s.match(mau)
    if (m) {
      // "18.5tr" và "18,5tr" đều là mười tám phẩy năm triệu; dấu chấm ở đây là
      // dấu thập phân chứ không phải dấu phân nhóm hàng nghìn.
      const so = Number(m[1].replace(/\./g, '.').replace(/,/g, '.'))
      return Number.isFinite(so) ? Math.round(so * he) : null
    }
  }
  if (/[^\d.\s]/.test(s)) return null   // còn chữ lạ — người dùng đang gõ dở
  return Number(s.replace(/\D/g, '')) || 0
}

const MENH_GIA = [
  { nhan: '+1 triệu', so: 1e6 },
  { nhan: '+5 triệu', so: 5e6 },
  { nhan: '+10 triệu', so: 1e7 },
]

export default function ContractComposer({ open, code, services = [], isDirector = false, saving = false, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    customer_name: '', phone: '', service_type: '', sales_source: '',
    contract_value: '', detail: '',
    date_signed: ngayHomNay(), due_date: congNgay(ngayHomNay(), 7),
  }))
  // Ô chọn 2 tầng Gói → Hạng mục. Lưu task_type_id (khoá), không lưu tên —
  // tên "Tách thửa" tồn tại ở cả gói Đo Vẽ lẫn Pháp Lý.
  const [danhMuc, setDanhMuc] = useState([])
  const [goiChon, setGoiChon] = useState('')
  const [hangMucChon, setHangMucChon] = useState('')
  // Ưu tiên hồ sơ (Q5) — chỉ giám đốc đặt, kèm lý do khi Cao/Gấp.
  const [uuTien, setUuTien] = useState('NORMAL')
  const [uuTienLyDo, setUuTienLyDo] = useState('')
  // Khách hàng 2 loại (anh Huy 18/08): cá nhân (CCCD) / doanh nghiệp (MST + đại diện).
  const [loaiKhach, setLoaiKhach] = useState('individual')
  const [khachId, setKhachId] = useState('')  // id khách cũ đã chọn → ghép, không tạo trùng
  const [dinhDanh, setDinhDanh] = useState({
    tax_id: '', id_card_number: '', id_card_date: '', id_card_place: '',
    email: '', zalo_phone: '', representative_name: '', representative_role: '',
  })
  const [ketQuaTim, setKetQuaTim] = useState([])
  const [dangTim, setDangTim] = useState(false)
  const [dangTraCuu, setDangTraCuu] = useState(false)
  const [diaGioi, setDiaGioi] = useState({ provinceCode: '', provinceName: '', wardCode: '', wardName: '' })
  const [tinhThanh, setTinhThanh] = useState([])
  const [phuongXa, setPhuongXa] = useState([])
  const [thieu, setThieu] = useState([])
  const bodyRef = useRef(null)

  // Mở lại form thì trả về trạng thái trắng — form giữ lại số liệu của hợp đồng
  // vừa lưu là cách nhanh nhất để tạo nhầm một hợp đồng trùng.
  useEffect(() => {
    if (!open) return
    setForm({
      customer_name: '', phone: '', service_type: '', sales_source: '',
      contract_value: '', detail: '',
      date_signed: ngayHomNay(), due_date: congNgay(ngayHomNay(), 7),
    })
    setDiaGioi({ provinceCode: '', provinceName: '', wardCode: '', wardName: '' })
    setPhuongXa([])
    setThieu([])
    setGoiChon('')
    setHangMucChon('')
    setUuTien('NORMAL')
    setUuTienLyDo('')
    setLoaiKhach('individual')
    setKhachId('')
    setDinhDanh({ tax_id: '', id_card_number: '', id_card_date: '', id_card_place: '',
      email: '', zalo_phone: '', representative_name: '', representative_role: '' })
    setKetQuaTim([])
  }, [open])

  // Tải cây danh mục Gói → Hạng mục một lần khi mở form.
  useEffect(() => {
    if (!open) return
    let huy = false
    apiFetch('/api/catalog/service-packages')
      .then(res => { if (!huy) setDanhMuc(res?.data || []) })
      .catch(() => {})
    return () => { huy = true }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    let huy = false
    fetch('/api/survey-records/wards/provinces')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!huy) setTinhThanh(Array.isArray(d) ? d : (d.data || [])) })
      .catch(() => {})
    return () => { huy = true }
  }, [open])

  useEffect(() => {
    if (!diaGioi.provinceCode) { setPhuongXa([]); return undefined }
    let huy = false
    fetch(`/api/survey-records/wards?province_code=${encodeURIComponent(diaGioi.provinceCode)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!huy) setPhuongXa(Array.isArray(d) ? d : (d.data || [])) })
      .catch(() => {})
    return () => { huy = true }
  }, [diaGioi.provinceCode])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  const batBuoc = useMemo(() => ([
    ['customer_name', form.customer_name],
    ['phone', form.phone],
    ['provinceCode', diaGioi.provinceCode],
    ['wardCode', diaGioi.wardCode],
    ['hangMucChon', hangMucChon],
    ['sales_source', form.sales_source],
    ['contract_value', form.contract_value],
    ['date_signed', form.date_signed],
    ['due_date', form.due_date],
  ]), [form, diaGioi, hangMucChon])

  const conThieu = batBuoc.filter(([, v]) => !String(v || '').trim()).map(([k]) => k)
  const tienSo = soTuChuoi(form.contract_value)

  const soNgay = useMemo(() => {
    const a = new Date(form.date_signed)
    const b = new Date(form.due_date)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
    return Math.round((b - a) / 864e5)
  }, [form.date_signed, form.due_date])

  const doi = (k) => (e) => {
    setForm(cur => ({ ...cur, [k]: e.target.value }))
    setThieu(cur => cur.filter(x => x !== k))
  }

  // Trong lúc gõ thì giữ nguyên chữ người dùng đang gõ ("18.5t" chưa đủ để biết
  // là triệu hay tỷ). Chỉ chuẩn hoá khi đã đọc ra được số, hoặc khi rời ô.
  const doiTien = (e) => {
    const go = e.target.value.slice(0, 24)
    const so = docTienGo(go)
    setForm(cur => ({
      ...cur,
      contract_value: so === null ? go : (so ? so.toLocaleString('vi-VN') : ''),
    }))
    setThieu(cur => cur.filter(x => x !== 'contract_value'))
  }

  const roiOTien = () => {
    const so = docTienGo(form.contract_value)
    setForm(cur => ({ ...cur, contract_value: so ? so.toLocaleString('vi-VN') : '' }))
  }

  const congTien = (them) => {
    const so = Math.min(soTuChuoi(form.contract_value) + them, 999999999999999)
    setForm(cur => ({ ...cur, contract_value: so.toLocaleString('vi-VN') }))
    setThieu(cur => cur.filter(x => x !== 'contract_value'))
  }

  const doiDinhDanh = (k) => (e) => { setKhachId(''); setDinhDanh(cur => ({ ...cur, [k]: e.target.value })) }

  // Tìm khách cũ theo tên/SĐT/CCCD/MST khi gõ ≥ 2 ký tự.
  useEffect(() => {
    const q = (form.customer_name || form.phone || '').trim()
    if (!open || q.length < 2 || khachId) { setKetQuaTim([]); return }
    let huy = false
    setDangTim(true)
    const t = setTimeout(() => {
      apiFetch(`/api/contracts/customers/search?q=${encodeURIComponent(q)}`)
        .then(res => { if (!huy) setKetQuaTim(res?.data || []) })
        .catch(() => {})
        .finally(() => { if (!huy) setDangTim(false) })
    }, 350)
    return () => { huy = true; clearTimeout(t) }
  }, [open, form.customer_name, form.phone, khachId])

  const chonKhachCu = (kh) => {
    setKhachId(kh.id)
    setLoaiKhach(kh.customer_type || 'individual')
    setForm(cur => ({ ...cur, customer_name: kh.full_name || '', phone: kh.phone || '' }))
    setDinhDanh({
      tax_id: kh.tax_id || '', id_card_number: kh.id_card_number || '',
      id_card_date: kh.id_card_date || '', id_card_place: kh.id_card_place || '',
      email: kh.email || '', zalo_phone: kh.zalo_phone || '',
      representative_name: kh.representative_name || '', representative_role: kh.representative_role || '',
    })
    setKetQuaTim([])
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
        setThieu(cur => cur.filter(x => x !== 'customer_name'))
      }
    } catch { /* im lặng — gõ tay được */ }
    finally { setDangTraCuu(false) }
  }

  const luu = useCallback((e) => {
    e.preventDefault()
    if (saving) return
    if (conThieu.length) {
      setThieu(conThieu)
      const o = bodyRef.current?.querySelector('.bad')
      o?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      o?.focus?.()
      return
    }
    // Nâng ưu tiên phải ghi lý do — chặn ở đây thay vì để backend trả 422.
    if (isDirector && uuTien !== 'NORMAL' && !uuTienLyDo.trim()) {
      setThieu(['uutien-lydo'])
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
      setThieu(thieuDinhDanh)
      bodyRef.current?.querySelector('.bad')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    const diaChi = [form.detail.trim(), diaGioi.wardName, diaGioi.provinceName].filter(Boolean).join(', ')
    onSubmit?.({
      contract_id: code,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      service_type: form.service_type,
      task_type_id: hangMucChon,
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
      contract_value: tienSo,
      address: diaChi,
      date_signed: form.date_signed,
      due_date: form.due_date,
    })
  }, [saving, conThieu, form, diaGioi, code, tienSo, hangMucChon, uuTien, uuTienLyDo, isDirector, loaiKhach, khachId, dinhDanh, onSubmit])

  if (!open) return null

  const xau = (k) => (thieu.includes(k) ? ' bad' : '')

  return createPortal(
    <div className="ctr-form-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose?.() }}>
      <form className="ctr-form" onSubmit={luu} role="dialog" aria-modal="true" aria-label="Soạn hợp đồng mới">

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
                  onClick={() => { setLoaiKhach(v); setKhachId('') }}>{nhan}</button>
              ))}
              {khachId && <span className="kh-loai__cu">✓ Khách cũ — đã tự điền</span>}
            </div>
            <div className="row c2">
              <div style={{ position: 'relative' }}>
                <label htmlFor="kh-ten">{loaiKhach === 'business' ? 'Tên công ty' : 'Tên khách hàng'}<u>*</u></label>
                <input className={`in${xau('customer_name')}`} id="kh-ten" autoComplete="off"
                  placeholder={loaiKhach === 'business' ? 'Công ty TNHH ...' : 'Nguyễn Văn An'}
                  value={form.customer_name} onChange={doi('customer_name')} />
                {/* Gợi ý khách cũ — chọn để tự điền, tránh nhập lại và tạo trùng. */}
                {ketQuaTim.length > 0 && (
                  <ul className="kh-goiy">
                    {ketQuaTim.map(kh => (
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
                <input className={`in${xau('phone')}`} id="kh-sdt" type="tel" inputMode="numeric"
                  placeholder="0901 234 567" value={form.phone} onChange={doi('phone')} />
              </div>
            </div>
            {loaiKhach === 'business' ? (
              <>
                <div className="row c2">
                  <div>
                    <label htmlFor="kh-mst">Mã số thuế<u>*</u></label>
                    <div className="kh-mst-row">
                      <input className={`in${xau('tax_id')}`} id="kh-mst" inputMode="numeric" placeholder="0312345678"
                        value={dinhDanh.tax_id} onChange={doiDinhDanh('tax_id')} />
                      <button type="button" className="kh-tracuu" disabled={dangTraCuu || (dinhDanh.tax_id || '').replace(/\D/g,'').length < 10}
                        onClick={traCuuMST}>{dangTraCuu ? '...' : 'Tra cứu'}</button>
                    </div>
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
                    <input className={`in${xau('representative_name')}`} id="kh-dd" placeholder="Nguyễn Văn Giám"
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
                    <input className={`in${xau('id_card_number')}`} id="kh-cccd" inputMode="numeric" placeholder="079300012345"
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
                    <label htmlFor="kh-ngaycap">Ngày cấp</label>
                    <input className="in" id="kh-ngaycap" type="date"
                      value={dinhDanh.id_card_date} onChange={doiDinhDanh('id_card_date')} />
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
            <div className="sec-hd"><h2>Địa chỉ bất động sản</h2><i /></div>
            <div className="row c3">
              <div>
                <label htmlFor="dc-tinh">Tỉnh / Thành phố<u>*</u></label>
                <select className={xau('provinceCode').trim()} id="dc-tinh" value={diaGioi.provinceCode}
                  onChange={(e) => {
                    const t = tinhThanh.find(x => String(x.code) === e.target.value)
                    setDiaGioi({ provinceCode: t?.code || '', provinceName: t?.name || '', wardCode: '', wardName: '' })
                    setThieu(cur => cur.filter(x => x !== 'provinceCode'))
                  }}>
                  <option value="">Chọn tỉnh/thành</option>
                  {tinhThanh.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dc-phuong">Phường / Xã<u>*</u></label>
                <select className={xau('wardCode').trim()} id="dc-phuong" disabled={!diaGioi.provinceCode}
                  value={diaGioi.wardCode}
                  onChange={(e) => {
                    const p = phuongXa.find(x => String(x.code) === e.target.value)
                    setDiaGioi(cur => ({ ...cur, wardCode: p?.code || '', wardName: p?.name || '' }))
                    setThieu(cur => cur.filter(x => x !== 'wardCode'))
                  }}>
                  <option value="">{diaGioi.provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}</option>
                  {phuongXa.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dc-duong">Số nhà, đường<small>không bắt buộc</small></label>
                <input className="in" id="dc-duong" placeholder="12 Nguyễn Huệ"
                  value={form.detail} onChange={doi('detail')} />
              </div>
            </div>
          </section>

          <section className="sec">
            <div className="sec-hd"><h2>Dịch vụ &amp; giá trị</h2><i /></div>
            <div className="row c2">
              <div>
                <label htmlFor="dv-goi">Gói dịch vụ<u>*</u></label>
                <select className={xau('hangMucChon').trim()} id="dv-goi"
                  value={goiChon}
                  onChange={(e) => { setGoiChon(e.target.value); setHangMucChon(''); setForm(f => ({ ...f, service_type: '' })) }}>
                  <option value="">Chọn gói</option>
                  {danhMuc.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="dv-loai">Hạng mục<u>*</u></label>
                <select className={xau('hangMucChon').trim()} id="dv-loai"
                  value={hangMucChon} disabled={!goiChon}
                  onChange={(e) => {
                    const id = e.target.value
                    setHangMucChon(id)
                    const goi = danhMuc.find(g => g.id === goiChon)
                    const hm = goi?.task_types.find(t => t.id === id)
                    setForm(f => ({ ...f, service_type: hm?.name || '' }))
                  }}>
                  <option value="">{goiChon ? 'Chọn hạng mục' : 'Chọn gói trước'}</option>
                  {(danhMuc.find(g => g.id === goiChon)?.task_types || []).map(hm => (
                    <option key={hm.id} value={hm.id}>{hm.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row c2">
              <div>
                <label htmlFor="dv-sale">Sale / nguồn<u>*</u></label>
                <input className={`in${xau('sales_source')}`} id="dv-sale" placeholder="Trần Minh"
                  value={form.sales_source} onChange={doi('sales_source')} />
              </div>
            </div>
            <div className="row">
              <div className="tien">
                <label htmlFor="dv-gia">Giá trị hợp đồng<u>*</u><small>gõ tắt được: 18.5tr, 500k</small></label>
                <div className="wrap">
                  <input className={`in money${xau('contract_value')}`} id="dv-gia" inputMode="decimal"
                    autoComplete="off" placeholder="0" value={form.contract_value}
                    onChange={doiTien} onBlur={roiOTien} />
                  <span className="suf">₫</span>
                </div>
                <p className="hint">{tienSo > 0 && <b>{docSoThanhChu(tienSo)}</b>}</p>
                {/* Hợp đồng ở đây gần như luôn là số tròn triệu — bấm nhanh hơn gõ. */}
                <div className="quick">
                  {MENH_GIA.map(m => (
                    <button key={m.so} type="button" onClick={() => congTien(m.so)}>{m.nhan}</button>
                  ))}
                  {tienSo > 0 && (
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
                  <select className="in" id="dv-uutien" value={uuTien}
                    onChange={(e) => { setUuTien(e.target.value); if (e.target.value === 'NORMAL') setUuTienLyDo('') }}>
                    <option value="NORMAL">Bình thường</option>
                    <option value="HIGH">Ưu tiên cao (×1,2)</option>
                    <option value="URGENT">Gấp (×1,5)</option>
                  </select>
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
                <label htmlFor="th-ky">Ngày ký<u>*</u></label>
                <input className={`in${xau('date_signed')}`} id="th-ky" type="date"
                  value={form.date_signed} onChange={doi('date_signed')} />
              </div>
              <div>
                <label htmlFor="th-han">Hạn hoàn thành<u>*</u></label>
                <input className={`in${xau('due_date')}`} id="th-han" type="date"
                  value={form.due_date} onChange={doi('due_date')} />
              </div>
              {soNgay !== null && (
                <div className={`span${soNgay < 0 ? ' is-bad' : ''}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  <span>{soNgay < 0 ? 'Hạn trước ngày ký' : soNgay === 0 ? 'Trong ngày' : `${soNgay} ngày`}</span>
                </div>
              )}
            </div>
          </section>

        </div>

        <footer className="ft">
          <div className={`stat${conThieu.length === 0 ? ' done' : ''}`}>
            <i className="dot" />
            <span>
              {conThieu.length === 0
                ? <>Đã điền đủ <b>{batBuoc.length}/{batBuoc.length}</b> trường bắt buộc</>
                : <>Còn thiếu <b>{conThieu.length}</b> trường bắt buộc</>}
            </span>
          </div>
          <button className="btn" type="button" disabled={saving} onClick={() => onClose?.()}>Huỷ</button>
          <button className="btn pri" type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu hợp đồng'}
          </button>
        </footer>

      </form>
    </div>,
    document.body,
  )
}
