import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookmarkPlus, Check, ChevronDown, FileText, Link2, Lock, Paperclip, Plus, Send, Trash2, Unlink, Upload } from 'lucide-react'

import FilePreviewModal from '../../components/ui/FilePreviewModal'
import Modal from '../../components/ui/Modal'
import SlotRequestModal from '../employee-portal/SlotRequestModal'
import { apiFetch, getAccessToken } from '../../lib/api'
import { laLoiChuaKichHoat, loiHienThi } from '../../lib/schemaV2'
import './documentRegister.css'

const API = import.meta.env.VITE_API_URL || ''

const STATUS_TONE = {
  CHUA_CO: 'idle',
  DA_NHAN: 'got',
  DA_KY: 'got',
  DA_SCAN: 'got',
  DA_NOP: 'sent',
  BI_TRA_LAI: 'back',
}

const SOURCE_TONE = {
  KHACH_HANG: 'customer',
  CONG_TY: 'company',
  CO_QUAN: 'agency',
}

const optionLabel = (options, value, fallback = '—') => (
  options?.find(option => option.value === value)?.label || fallback
)

/**
 * Sổ giấy tờ hồ sơ — danh mục có trước, tệp scan gắn vào sau.
 *
 * Mở từ tab Đo vẽ hay Pháp lý đều thấy đủ cả sổ gốc hợp đồng lẫn sổ thủ tục của
 * hạng mục. Giấy của bộ phận khác là "tài liệu chuyển giao": xem được, sửa thì
 * phải xin duyệt.
 */
/**
 * Trạng thái một loại giấy, suy từ chính dữ liệu slot.
 *
 * Thứ tự có chủ ý: TÀI LIỆU THẬT thắng mọi quyết định hành chính. Ô đã đủ tệp
 * hợp lệ thì là "Đã đủ", kể cả khi trước đó từng được miễn — miễn là để gỡ bế
 * tắc khi thiếu giấy, không phải để xoá công sức của người đã đi lấy được nó.
 * Lịch sử miễn không mất, chỉ lùi xuống thành nhãn phụ.
 *
 * Dưới "Đã đủ" mới tới quyết định hành chính, rồi mới tới tình trạng thiếu.
 */
export const trangThaiGiay = (slot) => {
  const soTep = slot.file_count || 0
  const canCo = Math.max(1, Number(slot.quantity || 1))
  const duTep = soTep >= canCo

  if (duTep) {
    return {
      nhan: 'Đã đủ',
      tone: 'du',
      title: `${soTep}/${canCo} tệp`,
      // Nhãn phụ giữ lịch sử: ô này từng được miễn nhưng cuối cùng vẫn có giấy.
      phu: slot.is_waived ? 'Từng được miễn' : null,
    }
  }
  if (slot.is_waived) {
    return { nhan: 'Đã được miễn', tone: 'mien', title: slot.waiver?.reason || '', phu: null }
  }
  if (slot.waiver_pending) {
    return { nhan: 'Đang xin miễn', tone: 'cho', title: 'Chờ Giám đốc duyệt', phu: null }
  }
  if (slot.is_required) {
    return {
      nhan: 'Thiếu',
      tone: 'thieu',
      title: soTep ? `Mới có ${soTep}/${canCo} tệp` : 'Bắt buộc nhưng chưa có tệp',
      phu: null,
    }
  }
  return { nhan: 'Chưa có', tone: 'idle', title: 'Không bắt buộc', phu: null }
}


export default function DocumentRegister({
  contractId,
  serviceLineId,
  addToast,
  // Ở danh sách hợp đồng, người dùng bấm lướt qua nhiều dòng. Tải sổ ngay khi
  // hiện panel là mỗi cú bấm bắn thêm hai request không ai đọc.
  collapsible = false,
  title = 'Sổ giấy tờ hồ sơ',
  // Sổ gốc ở bước K01 là GIẤY ĐẦU VÀO — chưa nộp gì cho cơ quan, nên không bày
  // những nơi lưu chỉ có nghĩa sau khi đã nộp.
  inputOnly = false,
  // Màn Hợp đồng cần thấy cả kho tệp thô lẫn cấu trúc đã phân loại, nhưng chỉ
  // K01 mới được gán/gỡ tệp vào ô giấy.
  showSourceRepository = false,
  onK01StatusChange,
  // Mã mục checklist đang làm. Có nó thì nhân viên đề xuất được loại giấy mới
  // ngay tại sổ; không có thì chỉ còn đường thêm ô trực tiếp (mô hình cũ).
  checklistResultId = '',
  // Mã bước đang mở. Có nó thì mỗi ô giấy được dán nhãn thuộc bước nào — sổ là
  // cấu trúc TỔNG dùng xuyên suốt, nhưng người đang làm K02 cần biết ngay dòng
  // nào là việc của mình và dòng nào chưa ai nhận.
  nodeKey = '',
}) {
  const [register, setRegister] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')
  const [busySlot, setBusySlot] = useState('')
  const [open, setOpen] = useState(!collapsible)
  const [adding, setAdding] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [places, setPlaces] = useState([])
  const [newSlot, setNewSlot] = useState({ name: '', source: 'KHACH_HANG', needs_original: false })
  const [sourceDocuments, setSourceDocuments] = useState([])
  const [sourceSummary, setSourceSummary] = useState({ unclassified: 0 })
  const [k01Status, setK01Status] = useState(null)
  const [slotSelections, setSlotSelections] = useState({})
  const [filePreview, setFilePreview] = useState(null)
  // Mô hình sổ của Hạng mục. V1 = sổ cũ dùng chung cấp Hợp đồng, chỉ được xem;
  // không bày thao tác ghi của V2 lên đó vì chúng neo theo Hạng mục.
  const [phanBo, setPhanBo] = useState({})
  const [phienBanSo, setPhienBanSo] = useState(1)
  const [khoaV2, setKhoaV2] = useState('')
  const [xinMienId, setXinMienId] = useState('')
  const [slotXinMien, setSlotXinMien] = useState(null)
  const [moDeXuat, setMoDeXuat] = useState(false)
  const [expandedSlotId, setExpandedSlotId] = useState('')
  const filePreviewUrlRef = useRef('')

  const load = useCallback(async () => {
    if (!contractId) return
    try {
      // Mã hợp đồng có dạng "003/BK-2026" — dấu gạch chéo làm vỡ đường dẫn nếu
      // nhét vào path, nên truyền bằng query.
      const params = new URLSearchParams({ contract_id: contractId })
      if (serviceLineId) params.set('service_line_id', serviceLineId)
      const needsSourceData = Boolean(showSourceRepository || (inputOnly && serviceLineId))
      const needsK01Status = Boolean(inputOnly && serviceLineId)
      const [data, metaData, placeData, sourceData, statusData] = await Promise.all([
        apiFetch(`/api/document-register/register?${params}`),
        meta ? Promise.resolve(meta) : apiFetch('/api/document-register/meta'),
        apiFetch('/api/document-register/storage-locations'),
        needsSourceData
          ? apiFetch(`/api/document-register/contracts/${encodeURI(contractId)}/source-documents`)
          : Promise.resolve(null),
        needsK01Status
          ? apiFetch(`/api/document-register/service-lines/${serviceLineId}/k01-status`)
          : Promise.resolve(null),
      ])
      setRegister(data)
      setPhienBanSo(Number(data?.register_version || 1))
      setPhanBo(data?.phan_bo_theo_buoc || {})
      setMeta(metaData)
      setPlaces(placeData?.data || [])
      if (needsSourceData) {
        setSourceDocuments(sourceData?.data || [])
        setSourceSummary({ unclassified: Number(sourceData?.unclassified || 0) })
      }
      if (needsK01Status) {
        const nextK01Status = statusData?.data || statusData || null
        setK01Status(nextK01Status)
        onK01StatusChange?.(nextK01Status)
      }
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'Không tải được sổ giấy tờ.')
    }
  }, [contractId, serviceLineId, inputOnly, showSourceRepository, meta, onK01StatusChange])

  useEffect(() => {
    if (collapsible) setOpen(false)
    setExpandedSlotId('')
  }, [contractId, serviceLineId, collapsible])

  useEffect(() => {
    if (open) load()
  }, [contractId, serviceLineId, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeFilePreview = useCallback(() => {
    if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current)
    filePreviewUrlRef.current = ''
    setFilePreview(null)
  }, [])

  useEffect(() => () => {
    if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current)
  }, [])

  // Hook phải nằm TRƯỚC mọi return sớm: React đòi thứ tự gọi hook giống hệt
  // nhau ở mọi lần render.
  const xinMienGiay = useCallback(async (slot, lyDo) => {
    setXinMienId(slot.id)
    try {
      await apiFetch(`/api/document-register/slots/${slot.id}/waivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // service_line_id gửi lên nhưng server tự đối chiếu lại — không tin
        // client, chỉ dùng để biết người dùng đang đứng ở Hạng mục nào.
        body: JSON.stringify({ service_line_id: serviceLineId, reason: lyDo }),
      })
      addToast?.('Đã gửi Giám đốc duyệt.', 'success')
      setSlotXinMien(null)
      await load()
    } catch (loi) {
      if (laLoiChuaKichHoat(loi)) setKhoaV2(loiHienThi(loi))
      addToast?.(loiHienThi(loi, 'Không gửi được yêu cầu.'), 'error')
    } finally {
      setXinMienId('')
    }
  }, [serviceLineId, addToast, load])

  if (!contractId) return null

  if (collapsible && !open) {
    return <button type="button" className="dr-open" onClick={() => setOpen(true)}>
      <FileText size={15} /> {title}
    </button>
  }

  const patchSlot = async (slotId, body) => {
    setBusySlot(slotId)
    try {
      await apiFetch(`/api/document-register/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await load()
    } catch (patchError) {
      const message = patchError.message || 'Không cập nhật được.'
      addToast?.(message, 'error')
      // 403 nghĩa là tài liệu chuyển giao của bộ phận khác — mời lập phiếu luôn
      // thay vì để nhân viên loay hoay không biết làm gì tiếp.
      if (/chuyển giao/.test(message)) askForChange(slotId)
    } finally {
      setBusySlot('')
    }
  }

  const askForChange = async (slotId) => {
    const reason = window.prompt('Lý do cần sửa tài liệu chuyển giao này? (Giám đốc sẽ duyệt)')
    if (!reason) return
    try {
      await apiFetch(`/api/document-register/slots/${slotId}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      addToast?.('Đã gửi yêu cầu, chờ Giám đốc duyệt', 'success')
    } catch (requestError) {
      addToast?.(requestError.message || 'Không gửi được yêu cầu.', 'error')
    }
  }

  const attachScan = async (slotId, fileList, input) => {
    const file = fileList?.[0]
    if (!file) return
    setBusySlot(slotId)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`${API}/api/document-register/slots/${slotId}/scans`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || 'Không nạp được bản scan.')
      addToast?.(`Đã nạp ${file.name}`, 'success')
      await load()
    } catch (uploadError) {
      const message = uploadError.message || 'Không nạp được bản scan.'
      addToast?.(message, 'error')
      if (/chuyển giao/.test(message)) askForChange(slotId)
    } finally {
      setBusySlot('')
      if (input) input.value = ''
    }
  }

  const openScan = async (document) => {
    try {
      const documentId = typeof document === 'string' ? document : document?.id
      const fileName = typeof document === 'string' ? 'Tài liệu' : (document?.file_name || 'Tài liệu')
      const response = await fetch(`${API}/api/document-register/scans/${documentId}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) throw new Error('Không mở được tệp.')
      const blob = await response.blob()
      if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current)
      const url = URL.createObjectURL(blob)
      filePreviewUrlRef.current = url
      setFilePreview({ fileName, mimeType: blob.type || document?.content_type || '', url })
    } catch (openError) {
      addToast?.(openError.message || 'Không mở được tệp.', 'error')
    }
  }

  const loadSuggestions = async () => {
    try {
      const payload = await apiFetch('/api/document-register/suggestions')
      setSuggestions(payload?.data || [])
    } catch { /* không có gợi ý thì vẫn gõ tay được */ }
  }

  const submitNewSlot = async (event) => {
    event.preventDefault()
    if (newSlot.name.trim().length < 3) return
    try {
      await apiFetch(`/api/document-register/contracts/${encodeURI(contractId)}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSlot, service_line_id: serviceLineId || null }),
      })
      addToast?.(`Đã thêm mục “${newSlot.name.trim()}”`, 'success')
      setNewSlot({ name: '', source: 'KHACH_HANG', needs_original: false })
      setAdding(false)
      await load()
    } catch (addError) {
      addToast?.(addError.message || 'Không thêm được mục.', 'error')
    }
  }

  const removeSlot = async (slotId, name) => {
    if (!window.confirm(`Gỡ mục “${name}” khỏi sổ?`)) return
    try {
      await apiFetch(`/api/document-register/slots/${slotId}`, { method: 'DELETE' })
      addToast?.('Đã gỡ mục', 'success')
      await load()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không gỡ được mục.', 'error')
    }
  }

  const linkSourceDocument = async (document) => {
    const slotId = slotSelections[document.id]
    if (!slotId) {
      addToast?.('Chọn loại giấy tờ trước khi gán.', 'error')
      return
    }
    setBusySlot(slotId)
    try {
      await apiFetch(`/api/document-register/slots/${slotId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: document.id }),
      })
      setSlotSelections(current => ({ ...current, [document.id]: '' }))
      addToast?.(`Đã phân loại ${document.file_name}`, 'success')
      await load()
    } catch (linkError) {
      addToast?.(linkError.message || 'Không gán được tài liệu.', 'error')
    } finally {
      setBusySlot('')
    }
  }

  const unlinkSourceDocument = async (slotId, document) => {
    setBusySlot(slotId)
    try {
      await apiFetch(`/api/document-register/slots/${slotId}/links/${document.id}`, { method: 'DELETE' })
      addToast?.(`Đã gỡ phân loại ${document.file_name}`, 'success')
      await load()
    } catch (unlinkError) {
      addToast?.(unlinkError.message || 'Không gỡ được phân loại.', 'error')
    } finally {
      setBusySlot('')
    }
  }

  const promoteSlot = async (slotId, name) => {
    if (!window.confirm(
      `Đưa “${name}” vào bộ mẫu?\n\n`
      + 'Từ lần sau mục này hiện sẵn cho mọi hồ sơ cùng thủ tục, '
      + 'nên không ai gõ lại tên theo kiểu của mình nữa.'
    )) return
    try {
      const payload = await apiFetch(`/api/document-register/slots/${slotId}/promote`, { method: 'POST' })
      addToast?.(`Đã đưa “${name}” vào mẫu · ${payload?.data?.scope || ''}`, 'success')
      await load()
    } catch (promoteError) {
      addToast?.(promoteError.message || 'Không đưa vào mẫu được.', 'error')
    }
  }

  /**
   * Nơi lưu và trạng thái có thể mâu thuẫn: giấy không thể vừa "đang ở cơ quan"
   * vừa mang trạng thái "Đã nhận". Chỉ NHẮC chứ không tự đổi — âm thầm sửa thứ
   * người dùng không bấm là cách nhanh nhất làm họ hết tin vào số liệu.
   */
  const mismatchOf = (slot) => {
    if (!slot.storage_location_id) return null
    const place = places.find(item => item.id === slot.storage_location_id)
    if (!place?.implies_status || place.implies_status === slot.status) return null
    return { place, expected: place.implies_status, label: place.implies_status_label }
  }

  const summary = register?.summary
  const groups = register?.groups || []
  const customerSlots = groups.flatMap(group => group.slots || []).filter(slot => slot.source === 'KHACH_HANG')
  const structuredReadOnly = showSourceRepository && !inputOnly

  return <section className="dr" aria-label="Sổ giấy tờ hồ sơ">
    <header className="dr-head">
      <h3><FileText size={17} /> {title}</h3>
      {summary && <span className={summary.missing.length ? 'is-missing' : 'is-full'}>
        {summary.missing.length
          ? <><AlertTriangle size={13} /> Thiếu {summary.missing.length}/{summary.required} giấy bắt buộc</>
          : <><Check size={13} /> Đủ {summary.required} giấy bắt buộc</>}
      </span>}
    </header>

    {error && <p className="dr-error" role="alert">{error}</p>}
    {!register && !error && <p className="dr-loading">Đang tải sổ giấy tờ…</p>}

    {(showSourceRepository || (inputOnly && serviceLineId)) && register && (
      <section className="dr-source" aria-label="Kho tài liệu khách gửi">
        <div className="dr-source__head">
          <div>
            <h4><Paperclip size={15} /> Kho tài liệu khách gửi</h4>
            <span>{sourceDocuments.length} tệp nguồn</span>
          </div>
          {sourceSummary.unclassified > 0 && (
            <p>{sourceSummary.unclassified} tệp chưa phân loại — có thể thuộc Hạng mục khác</p>
          )}
        </div>
        {sourceDocuments.length === 0 ? (
          <p className="dr-source__empty">Chưa có tài liệu nào được nạp khi tạo hợp đồng.</p>
        ) : sourceDocuments.map(document => (
          <article key={document.id} className={`dr-source__file${(document.slots || []).length === 0 ? ' is-unclassified' : ''}`}>
            <div className="dr-source__identity">
              <FileText size={16} />
              <button
                type="button"
                className="dr-source__preview"
                title={document.file_name}
                aria-label={`Xem ${document.file_name}`}
                onClick={() => openScan(document)}
              >{document.file_name}</button>
              {(document.slots || []).length === 0 && <span className="dr-source__unclassified">Chưa phân loại</span>}
              {(document.slots || []).map(slot => (
                <span className="dr-source__chip" key={slot.id || slot.slot_id}>
                  {slot.name || slot.slot_name}
                  {inputOnly && serviceLineId && (
                    <button
                      type="button"
                      title={`Gỡ khỏi ${slot.name || slot.slot_name}`}
                      aria-label={`Gỡ ${document.file_name} khỏi ${slot.name || slot.slot_name}`}
                      onClick={() => unlinkSourceDocument(slot.id || slot.slot_id, document)}
                    ><Unlink size={11} /></button>
                  )}
                </span>
              ))}
            </div>
            {inputOnly && serviceLineId && (
              <div className="dr-source__assign">
                <select
                  aria-label={`Chọn ô giấy cho ${document.file_name}`}
                  value={slotSelections[document.id] || ''}
                  onChange={event => setSlotSelections(current => ({ ...current, [document.id]: event.target.value }))}
                >
                  <option value="">Chọn loại giấy tờ…</option>
                  {customerSlots.map(slot => <option key={slot.id} value={slot.id}>{slot.name}</option>)}
                </select>
                <button type="button" aria-label={`Gán tài liệu ${document.file_name}`} onClick={() => linkSourceDocument(document)}>
                  <Link2 size={13} /> Gán
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    )}

    {(showSourceRepository || (inputOnly && serviceLineId)) && register && (
      <div className="dr-structured-title">
        <span>Hồ sơ đã phân loại</span>
        <i />
      </div>
    )}

    {inputOnly && k01Status && !k01Status.can_submit && (
      <p className="dr-k01-blocker" role="alert">
        <Lock size={14} /> Không thể nộp K01: {(k01Status.required_missing || []).length > 0
          ? `thiếu ${k01Status.required_missing.join(' · ')}`
          : 'còn tài liệu bắt buộc cần xử lý'}
      </p>
    )}

    {khoaV2 && (
      <p className="dr-v2-locked" role="status">{khoaV2}</p>
    )}

    {groups.map(group => group.slots.length > 0 && (
      <div key={group.source} className={`dr-group is-${SOURCE_TONE[group.source]}`}>
        <div className="dr-group__bar">
          <strong>{group.label}</strong>
          <span>{group.slots.length} giấy</span>
        </div>

        <div className="dr-slot-list">
          {group.slots.map(slot => {
            const mismatch = mismatchOf(slot)
            const expanded = expandedSlotId === slot.id
            const storageName = places.find(place => place.id === slot.storage_location_id)?.name

            return <article
              key={slot.id}
              className={`dr-slot${expanded ? ' is-expanded' : ''}${busySlot === slot.id ? ' is-busy' : ''}`}
            >
              <div className="dr-slot__summary">
                <div className="dr-slot__primary">
                  <div className="dr-name">
                    <span>{slot.name}{slot.is_required && <b title="Bắt buộc">*</b>}</span>
                    {slot.needs_original && <em>cần bản chính</em>}
                    {slot.is_custom && <span className="dr-tag is-custom" title="Mục phát sinh, nhân viên tự thêm">phát sinh</span>}
                    {slot.scope === 'CONTRACT' && serviceLineId && (
                      <span className="dr-tag" title="Giấy của sổ gốc hợp đồng, dùng chung mọi hạng mục">sổ gốc</span>
                    )}
                    {(() => {
                      const tt = trangThaiGiay(slot)
                      return <>
                        <span className={`dr-tt is-${tt.tone}`} title={tt.title}>{tt.nhan}</span>
                        {tt.phu && <span className="dr-tt is-phu" title={slot.waiver?.reason || ''}>{tt.phu}</span>}
                      </>
                    })()}
                    {(() => {
                      // Ba con số của mỗi loại giấy: cần bao nhiêu, đã có bao
                      // nhiêu, còn thiếu bao nhiêu. Chỉ hiện "cần 1" trống trơn
                      // thì người làm vẫn phải tự đếm tệp.
                      const can = slot.quantity || 1
                      const daCo = slot.file_count || 0
                      const thieu = Math.max(0, can - daCo)
                      return <span className="dr-dem" title={`Cần ${can} · đã có ${daCo} · còn thiếu ${thieu}`}>
                        {daCo}/{can}{thieu > 0 && <b> · thiếu {thieu}</b>}
                      </span>
                    })()}
                    {(() => {
                      // Sổ dùng chung mọi bước, nên phải nói rõ dòng này của ai.
                      if (!nodeKey || !slot.template_id) return null
                      const cua = phanBo[slot.template_id]
                      if (!cua) {
                        return <span className="dr-tag is-chua-phan" title="Giám đốc chưa gắn loại giấy này vào Checklist của bước nào">
                          chưa phân bước
                        </span>
                      }
                      if (cua === nodeKey) {
                        return <span className="dr-tag is-buoc-nay" title="Loại giấy này thuộc Checklist của bước đang mở">
                          bước này
                        </span>
                      }
                      return <span className="dr-tag" title={`Thuộc Checklist của bước ${cua.toUpperCase()}`}>
                        {cua.toUpperCase()}
                      </span>
                    })()}
                  </div>

                  <div className="dr-slot__files">
                    {slot.files?.length > 0 ? slot.files.map(file => (
                      <button
                        key={file.id}
                        type="button"
                        className="dr-file"
                        title={file.file_name}
                        aria-label={`Xem ${file.file_name}`}
                        onClick={() => openScan(file)}
                      >
                        <Paperclip size={12} /> {file.file_name}
                      </button>
                    )) : <span className="dr-slot__empty">Chưa có tệp</span>}
                  </div>
                </div>

                {/* Mở cho CẢ V1. Phiếu miễn neo theo (ô giấy, Hạng mục) và mọi
                    truy vấn đọc đều lọc theo service_line_id, nên miễn cho Hạng
                    mục này không làm Hạng mục khác trên cùng hợp đồng hết đòi
                    giấy — kể cả khi ô giấy là ô dùng chung cấp Hợp đồng. Chặn
                    theo phiên bản sổ chỉ làm nhân viên bí đường: giấy khách
                    không có thật thì K01 không bao giờ nộp được. */}
                {!khoaV2 && slot.is_required
                  && !slot.is_waived && !slot.waiver_pending
                  && (slot.file_count || 0) === 0 && serviceLineId && (
                  <button
                    type="button"
                    className="dr-slot__mien"
                    disabled={xinMienId === slot.id}
                    onClick={() => setSlotXinMien(slot)}
                  >
                    {xinMienId === slot.id ? 'Đang gửi…' : 'Xin miễn giấy này'}
                  </button>
                )}

                <button
                  type="button"
                  className="dr-slot__toggle"
                  aria-expanded={expanded}
                  aria-controls={`dr-slot-details-${slot.id}`}
                  aria-label={`${expanded ? 'Ẩn' : 'Xem'} chi tiết ${slot.name}`}
                  onClick={() => setExpandedSlotId(expanded ? '' : slot.id)}
                >
                  <span>Chi tiết</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              </div>

              {expanded && <div id={`dr-slot-details-${slot.id}`} className="dr-slot__details">
                <div className="dr-slot__field">
                  <span>Trạng thái</span>
                  {structuredReadOnly ? (
                    <div className={`dr-slot__value is-${STATUS_TONE[slot.status] || 'idle'}`} aria-label={`Trạng thái ${slot.name}`}>
                      {optionLabel(meta?.statuses, slot.status)}
                    </div>
                  ) : <>
                    <select
                      className={`dr-status is-${STATUS_TONE[slot.status] || 'idle'}`}
                      aria-label={`Trạng thái ${slot.name}`}
                      value={slot.status}
                      disabled={busySlot === slot.id}
                      onChange={(event) => patchSlot(slot.id, { status: event.target.value })}
                    >
                      {(meta?.statuses || []).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {mismatch && (
                      <button
                        type="button"
                        className="dr-mismatch"
                        title={`“${mismatch.place.name}” nghĩa là giấy đã ${mismatch.label.toLowerCase()}. Bấm để sửa trạng thái.`}
                        disabled={busySlot === slot.id}
                        onClick={() => patchSlot(slot.id, { status: mismatch.expected })}
                      >
                        <AlertTriangle size={11} /> nên là “{mismatch.label}”
                      </button>
                    )}
                  </>}
                </div>

                <div className="dr-slot__field">
                  <span>Loại bản</span>
                  {structuredReadOnly ? (
                    <div className="dr-slot__value" aria-label={`Loại bản ${slot.name}`}>
                      {optionLabel(meta?.copy_types, slot.copy_type)}
                    </div>
                  ) : (
                    <select
                      className="dr-copy"
                      aria-label={`Loại bản ${slot.name}`}
                      value={slot.copy_type || ''}
                      disabled={busySlot === slot.id}
                      onChange={(event) => patchSlot(slot.id, { copy_type: event.target.value })}
                    >
                      <option value="">—</option>
                      {(meta?.copy_types || []).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="dr-slot__field">
                  <span>Số lượng</span>
                  <div className="dr-slot__value">{slot.quantity}</div>
                </div>

                <div className="dr-slot__field">
                  <span>Vị trí bản giấy</span>
                  {structuredReadOnly ? (
                    <div className="dr-slot__value" aria-label={`Vị trí bản giấy ${slot.name}`}>
                      {storageName || 'Chưa ghi nhận vị trí'}
                    </div>
                  ) : (
                    <select
                      className={`dr-place${slot.storage_is_external ? ' is-external' : ''}`}
                      aria-label={`Vị trí bản giấy ${slot.name}`}
                      value={slot.storage_location_id || ''}
                      disabled={busySlot === slot.id}
                      onChange={(event) => patchSlot(slot.id, { storage_location_id: event.target.value || '' })}
                    >
                      <option value="">Chưa ghi nhận vị trí</option>
                      <optgroup label="Đang lưu tại công ty">
                        {places.filter(place => !place.is_external).map(place => (
                          <option key={place.id} value={place.id}>{place.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Đang được giữ bên ngoài">
                        {places
                          .filter(place => place.is_external)
                          .filter(place => !(inputOnly && ['DA_NOP', 'BI_TRA_LAI'].includes(place.implies_status)))
                          .map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
                      </optgroup>
                    </select>
                  )}
                </div>

                {!structuredReadOnly && <div className="dr-slot__actions">
                  <label className="dr-attach" title="Nạp bản scan vào ô giấy này">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                      disabled={busySlot === slot.id}
                      onChange={(event) => attachScan(slot.id, event.target.files, event.target)}
                    />
                    <Upload size={13} /> <span>Nạp tệp</span>
                  </label>
                  <button type="button" className="dr-ask" onClick={() => askForChange(slot.id)}>
                    <Send size={13} /> <span>Xin sửa</span>
                  </button>
                  {slot.is_custom && (
                    <button type="button" className="dr-ask is-promote" onClick={() => promoteSlot(slot.id, slot.name)}>
                      <BookmarkPlus size={13} /> <span>Lưu vào mẫu</span>
                    </button>
                  )}
                  {slot.is_custom && slot.file_count === 0 && (
                    <button type="button" className="dr-ask is-danger" onClick={() => removeSlot(slot.id, slot.name)}>
                      <Trash2 size={13} /> <span>Gỡ mục</span>
                    </button>
                  )}
                </div>}
              </div>}
            </article>
          })}
        </div>
      </div>
    ))}

    {register && !structuredReadOnly && (adding ? (
      <form className="dr-add" onSubmit={submitNewSlot}>
        <input
          list="dr-suggest"
          className="dr-add__name"
          placeholder="Tên loại giấy tờ phát sinh…"
          value={newSlot.name}
          autoFocus
          onChange={(event) => setNewSlot({ ...newSlot, name: event.target.value })}
        />
        {/* Gợi ý từ bộ mẫu để cùng một tờ giấy không thành ba tên khác nhau. */}
        <datalist id="dr-suggest">
          {suggestions.map(item => <option key={item.name} value={item.name} />)}
        </datalist>

        <select
          className="dr-add__source"
          value={newSlot.source}
          onChange={(event) => setNewSlot({ ...newSlot, source: event.target.value })}
        >
          {(meta?.sources || []).map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <label className="dr-add__flag">
          <input
            type="checkbox"
            checked={newSlot.needs_original}
            onChange={(event) => setNewSlot({ ...newSlot, needs_original: event.target.checked })}
          />
          Cần bản chính
        </label>

        <button type="submit" className="dr-add__save">Thêm mục</button>
        <button type="button" className="dr-add__cancel" onClick={() => setAdding(false)}>Huỷ</button>
      </form>
    ) : (
      phienBanSo === 2 && !khoaV2 && checklistResultId ? (
        // Mô hình V2: loại giấy mới phải qua Giám đốc duyệt mới vào hồ sơ chính
        // thức. Thêm thẳng như mô hình cũ là để nhân viên tự quyết cấu trúc hồ
        // sơ, và Giám đốc chỉ biết khi đã rồi.
        <button type="button" className="dr-add-open" onClick={() => setMoDeXuat(true)}>
          <Plus size={14} /> Đề xuất loại tài liệu
        </button>
      ) : (
      <button type="button" className="dr-add-open" onClick={() => { setAdding(true); loadSuggestions() }}>
        <Plus size={14} /> Thêm loại giấy tờ phát sinh
      </button>
      )
    ))}

    {moDeXuat && (
      <SlotRequestModal
        checklistResultId={checklistResultId}
        onClose={() => setMoDeXuat(false)}
        onSaved={() => { setMoDeXuat(false); load() }}
        addToast={addToast}
      />
    )}

    {register && summary?.missing?.length > 0 && (
      <p className="dr-missing">
        <Lock size={13} /> Còn thiếu: {summary.missing.join(' · ')}
      </p>
    )}
    {/* Modal riêng thay cho window.prompt: tiêu đề nói rõ đây là GỬI YÊU CẦU,
        không phải tự miễn. Nhân viên phải hiểu việc này cần Giám đốc duyệt. */}
    <Modal
      open={Boolean(slotXinMien)}
      onClose={() => setSlotXinMien(null)}
      title="Gửi yêu cầu xin miễn giấy tờ"
      size="md"
      id="xin-mien-giay"
    >
      {slotXinMien && <form
        className="dr-mien-form"
        onSubmit={(event) => {
          event.preventDefault()
          const lyDo = new FormData(event.currentTarget).get('ly_do')?.toString().trim()
          if (!lyDo || lyDo.length < 5) return
          xinMienGiay(slotXinMien, lyDo)
        }}
      >
        <p className="dr-mien-form__giay">
          <strong>{slotXinMien.name}</strong>
          <span>Yêu cầu này chỉ có hiệu lực với Hạng mục đang mở, không ảnh hưởng Hạng mục khác.</span>
        </p>
        <label>
          Vì sao hồ sơ này không cần giấy đó?<u>*</u>
          <textarea
            name="ly_do"
            rows={3}
            required
            minLength={5}
            placeholder="Ví dụ: Chủ đất độc thân, không có giấy đăng ký kết hôn"
          />
        </label>
        <p className="dr-mien-form__note">
          Giám đốc đọc lý do này trước khi quyết định. Từ chối nghĩa là bạn phải liên hệ khách để lấy bằng được.
        </p>
        <div className="dr-mien-form__actions">
          <button type="button" onClick={() => setSlotXinMien(null)}>Huỷ</button>
          <button type="submit" disabled={xinMienId === slotXinMien.id}>
            {xinMienId === slotXinMien.id ? 'Đang gửi…' : 'Gửi Giám đốc duyệt'}
          </button>
        </div>
      </form>}
    </Modal>

    <FilePreviewModal
      open={Boolean(filePreview)}
      fileName={filePreview?.fileName}
      mimeType={filePreview?.mimeType}
      url={filePreview?.url}
      onClose={closeFilePreview}
    />
  </section>
}
