import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react'

import FilePreviewModal from '../../components/ui/FilePreviewModal'
import { apiFetch, getAccessToken } from '../../lib/api'
import './documentCabinet.css'

// lib/api không xuất base URL; các màn khác trong dự án khai tại chỗ như thế này.
const API = import.meta.env.VITE_API_URL || ''

/**
 * Tủ hồ sơ của một Hợp đồng — hai ngăn, gắn theo đúng cặp Gói + Hạng mục.
 *
 * Đây KHÔNG phải danh mục dùng chung toàn hệ thống: mở hợp đồng nào thì chỉ thấy
 * giấy của hợp đồng đó, và chỉ những loại giấy đã khai cho đúng Gói + Hạng mục
 * của nó trong tab Mẫu giấy tờ. Vì thế mọi lời gọi đều mang `contract_id`, và
 * ngăn loại giấy mang thêm `service_line_id`.
 *
 * ── Vì sao xếp theo BƯỚC, không theo nguồn giấy ─────────────────────────────
 * Bốn ngăn theo nguồn (công ty soạn / khách cung cấp / nhà nước) đọc thẳng ô
 * giấy, nên một hợp đồng khai 18 loại giấy vẫn bày ra 58 dòng: ô giấy sinh thừa
 * bởi luật dựng sổ cũ nằm lẫn vào đó, và không dòng nào nói mình thuộc bước nào.
 *
 * Câu hỏi người ta mở tủ ra để hỏi là "hạng mục này cần tờ gì, ở bước nào" —
 * câu đó thuộc về MASTER DATA (`cabinet_by_node`), còn ô giấy chỉ trả lời "đã có
 * tờ đó chưa". Tách hai vai ra thì ô thừa tự không xuất hiện.
 *
 * "Nguyên bản" là ngăn khác hẳn: nó liệt kê TỆP thô khách gửi, chưa biết là giấy
 * gì. Trộn hai thứ vào một danh sách sẽ khiến người dùng không phân biệt được
 * "tệp này chưa xếp vào đâu" với "loại giấy này chưa ai nộp" — hai vấn đề cần
 * hai hành động khác nhau.
 */

const RAW_TAB = 'RAW'
const NODE_TAB = 'NODE'

/** Khoá của nhóm giấy chưa bước nào nhận. `node_code` là null nên cần khoá thay. */
const UNASSIGNED = 'CHUA_GAN'

const TABS = [
  { key: RAW_TAB, label: 'nguyên bản' },
  { key: NODE_TAB, label: 'theo bước' },
]

const SOURCE_SHORT = {
  KHACH_HANG: 'khách',
  CONG_TY: 'công ty',
  CO_QUAN: 'nhà nước',
}

const groupKey = (group) => group.node_code || UNASSIGNED

/**
 * Bỏ dấu để tìm kiếm.
 *
 * NFD tách được thanh điệu (ổ → o + ̉) nhưng KHÔNG tách "đ" — nó là ký tự riêng
 * U+0111, không phải "d" cộng dấu. Quên vế này thì gõ "so do" không ra "Sổ đỏ",
 * đúng loại giấy người ta tìm nhiều nhất.
 */
function stripAccents(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
}

/** Bản chính / bản sao cho dòng phụ. Không kèm số lượng: một loại giấy có thể
 *  gồm nhiều file, nhân viên nộp bao nhiêu là bấy nhiêu. */
function describeCopy(doc) {
  if (doc.needs_original) return 'Bản chính'
  return doc.copy_type_label || ''
}

export default function DocumentCabinet({ contractId, serviceLines = [], addToast }) {
  const [open, setOpen] = useState(true)
  const [serviceLineId, setServiceLineId] = useState('')
  const [tab, setTab] = useState(RAW_TAB)
  const [query, setQuery] = useState('')
  const [register, setRegister] = useState(null)
  const [rawFiles, setRawFiles] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [linkingDocId, setLinkingDocId] = useState(null)
  // null = chưa ai đụng vào, để mặc định mở bước đầu. Mảng = lựa chọn của người
  // dùng, kể cả khi họ đóng hết.
  const [openNodes, setOpenNodes] = useState(null)
  const [pickedSlotId, setPickedSlotId] = useState('')
  const [preview, setPreview] = useState(null)

  const fileInputRef = useRef(null)
  const objectUrlRef = useRef(null)

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  // Đổi hợp đồng thì quay về ngăn đầu, xoá từ khoá và chọn lại hạng mục đầu.
  // Giữ nguyên bộ lọc của hợp đồng trước làm người dùng tưởng hợp đồng mới không
  // có giấy nào.
  useEffect(() => {
    setTab(RAW_TAB)
    setQuery('')
    setLinkingDocId(null)
    setOpenNodes(null)
    setServiceLineId(serviceLines[0]?.id || '')
    // serviceLines đổi tham chiếu mỗi lần render cha, nên chỉ theo dõi mã hợp
    // đồng và danh sách mã hạng mục — thứ thực sự quyết định phải nạp lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, serviceLines.map(line => line.id).join(',')])

  // Hợp đồng có Hạng mục mà chưa chọn xong thì CHƯA nạp: gọi sớm một nhịp sẽ
  // tốn thêm một request và loé ra sổ đời 1 (thiếu service_line_id thì backend
  // rơi về mô hình cũ, mọi nhãn bước biến mất rồi hiện lại).
  const waitingForScope = serviceLines.length > 0 && !serviceLineId

  const load = useCallback(async () => {
    if (!contractId || waitingForScope) return
    try {
      const registerUrl = `/api/document-register/register?contract_id=${encodeURIComponent(contractId)}`
        + (serviceLineId ? `&service_line_id=${encodeURIComponent(serviceLineId)}` : '')
      const [registerPayload, rawPayload] = await Promise.all([
        apiFetch(registerUrl),
        apiFetch(`/api/document-register/contracts/${encodeURIComponent(contractId)}/source-documents`),
      ])
      setRegister(registerPayload || null)
      setRawFiles(rawPayload?.data || [])
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'Không đọc được tủ hồ sơ.')
    }
  }, [contractId, serviceLineId, waitingForScope])

  useEffect(() => { load() }, [load])

  // Bộ giấy của Hạng mục, xếp theo bước — cấu trúc lấy từ master data.
  const nodeGroups = useMemo(() => register?.checklist_cabinet_by_node || [], [register])

  const counts = useMemo(
    () => nodeGroups.reduce(
      (sum, group) => ({ total: sum.total + group.total, done: sum.done + group.done }),
      { total: 0, done: 0 },
    ),
    [nodeGroups],
  )

  /**
   * Ô giấy còn trống mà tệp thô được phép gán vào.
   *
   * CHỈ loại giấy nguồn Khách hàng: kho nguyên bản là giấy KHÁCH gửi, nên không
   * phân loại được vào ô công ty soạn hay ô cơ quan trả. Backend chặn bằng 409
   * ("Kho giấy khách gửi chỉ được phân loại vào ô nguồn Khách hàng") — bày cả ba
   * nguồn ra đây là mời người dùng chọn một thứ chắc chắn hỏng.
   *
   * Đọc từ tủ theo bước chứ không quét thẳng ô giấy: ô sinh thừa bởi luật cũ
   * không thuộc bộ giấy của hạng mục này, gán tệp vào đó là chôn tệp ở chỗ không
   * bước nào tìm ra. Loại giấy đã khai mà chưa dựng được ô (`slot_id` rỗng) thì
   * cũng không gán được — nói thẳng còn hơn bày một lựa chọn gọi lên là hỏng.
   */
  const linkableSlots = useMemo(
    () => nodeGroups
      .flatMap(group => group.documents || [])
      .filter(doc => doc.source === 'KHACH_HANG' && doc.slot_id && (doc.file_count || 0) === 0)
      .map(doc => ({ id: doc.slot_id, name: doc.name })),
    [nodeGroups],
  )

  const badges = useMemo(() => ({
    // Nguyên bản đếm TỆP chưa xếp vào ô nào; ngăn theo bước đếm LOẠI GIẤY chưa
    // có tệp. Hai phép đếm khác nhau vì hai ngăn trả lời hai câu hỏi khác nhau.
    [RAW_TAB]: rawFiles.filter(file => !(file.slots || []).length).length,
    [NODE_TAB]: counts.total - counts.done,
  }), [rawFiles, counts])

  const matches = (text) => {
    const needle = stripAccents(query).trim()
    return !needle || stripAccents(text).includes(needle)
  }

  const visibleRawFiles = useMemo(
    () => rawFiles.filter(file => matches(file.file_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawFiles, query],
  )

  // Lọc theo tên thì bỏ luôn bước không còn tờ nào khớp — để lại một hàng tiêu đề
  // rỗng thì người tìm tưởng bước đó có giấy mà mở ra không thấy.
  const visibleGroups = useMemo(
    () => nodeGroups
      .map(group => ({ ...group, documents: (group.documents || []).filter(doc => matches(doc.name)) }))
      .filter(group => group.documents.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeGroups, query],
  )

  // Đang tìm kiếm thì mở hết bước còn khớp: gõ từ khoá rồi vẫn phải bấm từng
  // bước để xem kết quả là đánh mất chính tác dụng của ô tìm.
  const searching = Boolean(stripAccents(query).trim())
  const openedNodes = useMemo(() => {
    if (searching) return new Set(visibleGroups.map(groupKey))
    if (openNodes) return new Set(openNodes)
    return new Set(visibleGroups.slice(0, 1).map(groupKey))
  }, [searching, openNodes, visibleGroups])

  const toggleNode = (key) => setOpenNodes((current) => {
    const next = new Set(current ?? visibleGroups.slice(0, 1).map(groupKey))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return [...next]
  })

  const openFile = async (documentId, fileName, contentType) => {
    try {
      const response = await fetch(`${API}/api/document-register/scans/${documentId}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) throw new Error('Không mở được tệp.')
      const blob = await response.blob()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setPreview({ fileName, mimeType: blob.type || contentType || '', url, blob })
    } catch (openError) {
      addToast?.(openError.message || 'Không mở được tệp.', 'error')
    }
  }

  const uploadRawFile = async (event) => {
    const file = event.target.files?.[0]
    // Xoá value ngay để chọn lại ĐÚNG tệp vừa chọn vẫn kích hoạt onChange.
    event.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(
        `${API}/api/document-register/contracts/${encodeURIComponent(contractId)}/source-documents`,
        { method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: form },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || 'Không tải lên được tệp.')
      }
      addToast?.(`Đã thêm vào kho nguyên bản: ${file.name}`, 'success')
      await load()
    } catch (uploadError) {
      addToast?.(uploadError.message || 'Không tải lên được tệp.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const linkFile = async (documentId) => {
    if (!pickedSlotId) return
    try {
      await apiFetch(`/api/document-register/slots/${pickedSlotId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      })
      addToast?.('Đã gán tệp vào ô giấy', 'success')
      setLinkingDocId(null)
      setPickedSlotId('')
      await load()
    } catch (linkError) {
      addToast?.(linkError.message || 'Không gán được.', 'error')
    }
  }

  const unlinkFile = async (slotId, documentId) => {
    try {
      await apiFetch(`/api/document-register/slots/${slotId}/links/${documentId}`, { method: 'DELETE' })
      addToast?.('Đã gỡ khỏi ô giấy', 'success')
      await load()
    } catch (unlinkError) {
      addToast?.(unlinkError.message || 'Không gỡ được.', 'error')
    }
  }

  return (
    <section className="doc-cabinet">
      <button
        type="button"
        className="doc-cabinet__head"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-controls="doc-cabinet-body"
      >
        <span>tủ hồ sơ</span>
        <span className="doc-cabinet__chevron" aria-hidden="true">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div id="doc-cabinet-body">
          {/* Chỉ bày khi hợp đồng có NHIỀU hạng mục — lúc đó mới cần nói đang mở
              tủ nào. Một hạng mục thì hàng này chỉ nhắc lại thứ đã biết. */}
          {serviceLines.length > 1 && (
            <div className="doc-cabinet__scope">
              <span>Hạng mục</span>
              <select
                aria-label="Hạng mục của tủ hồ sơ"
                value={serviceLineId}
                onChange={(event) => {
                  setServiceLineId(event.target.value)
                  setLinkingDocId(null)
                  setOpenNodes(null)
                }}
              >
                {serviceLines.map(line => (
                  <option key={line.id} value={line.id}>{line.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="doc-cabinet__tabs" role="tablist" aria-label="Ngăn tủ hồ sơ">
            {TABS.map(item => {
              const count = badges[item.key] || 0
              const active = tab === item.key
              return (
                <button
                  type="button"
                  key={item.key}
                  role="tab"
                  aria-selected={active}
                  className={`doc-cabinet__tab${active ? ' is-active' : ''}`}
                  onClick={() => { setTab(item.key); setLinkingDocId(null) }}
                >
                  <span>{item.label}</span>
                  {/* Bằng 0 thì ẩn hẳn: một badge "0" chỉ làm nhiễu mắt. */}
                  {count > 0 && (
                    <span
                      className="doc-cabinet__badge"
                      title={item.key === RAW_TAB
                        ? `${count} tệp chưa gán vào ô giấy nào`
                        : `${count} loại giấy chưa có`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="doc-cabinet__tools">
            <div className="doc-cabinet__search">
              <Search size={14} className="doc-cabinet__search-icon" aria-hidden="true" />
              <input
                type="text"
                className="doc-cabinet__search-input"
                placeholder="tìm theo tên…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Tìm giấy tờ"
              />
              {query && (
                <button
                  type="button"
                  className="doc-cabinet__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Xoá từ khoá"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Chỉ ngăn Nguyên bản mới là chỗ đổ tệp thô. Ba ngăn kia liệt kê
                LOẠI GIẤY hồ sơ cần — thêm tệp thẳng vào đó là bỏ qua bước phân
                loại của K01. */}
            {tab === RAW_TAB && (
              <>
                <button
                  type="button"
                  className="doc-cabinet__add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Plus size={13} /> {uploading ? 'Đang tải…' : 'Thêm giấy tờ'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="doc-cabinet__file-input"
                  onChange={uploadRawFile}
                />
              </>
            )}
          </div>

          {error && <p className="doc-cabinet__error" role="alert">{error}</p>}

          {!error && tab === RAW_TAB && (
            <ul className="doc-cabinet__list">
              {visibleRawFiles.length === 0 && (
                <li className="doc-cabinet__empty">
                  Chưa có tệp nguyên bản nào. Bấm <strong>Thêm giấy tờ</strong> để tải lên.
                </li>
              )}
              {visibleRawFiles.map(file => {
                const linked = (file.slots || [])[0]
                return (
                  <li key={file.id}>
                    <div className="doc-cabinet__row">
                      <div className="doc-cabinet__main">
                        <button
                          type="button"
                          className="doc-cabinet__name-btn"
                          onClick={() => openFile(file.id, file.file_name, file.content_type)}
                          title="Bấm để xem tệp"
                        >
                          {file.file_name}
                        </button>
                        {linked && (
                          <span className="doc-cabinet__tick">
                            <Check size={12} /> Đã gán vào {linked.name}
                          </span>
                        )}
                      </div>
                      {linked ? (
                        <button
                          type="button"
                          className="doc-cabinet__unlink-btn"
                          onClick={() => unlinkFile(linked.id, file.id)}
                          aria-label={`Gỡ ${file.file_name} khỏi ${linked.name}`}
                        >
                          <X size={12} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="doc-cabinet__link-btn"
                          onClick={() => {
                            setLinkingDocId(current => (current === file.id ? null : file.id))
                            setPickedSlotId('')
                          }}
                        >
                          Gán vào ô giấy
                        </button>
                      )}
                    </div>

                    {linkingDocId === file.id && linkableSlots.length > 0 && (
                      <div className="doc-cabinet__picker">
                        <select
                          aria-label="Chọn ô giấy để gán"
                          value={pickedSlotId}
                          onChange={(event) => setPickedSlotId(event.target.value)}
                        >
                          <option value="">— chọn ô giấy —</option>
                          {linkableSlots.map(slot => (
                            <option key={slot.id} value={slot.id}>{slot.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!pickedSlotId}
                          onClick={() => linkFile(file.id)}
                        >
                          Gán
                        </button>
                      </div>
                    )}

                    {linkingDocId === file.id && linkableSlots.length === 0 && (
                      <div className="doc-cabinet__picker">
                        <span>Không còn ô giấy khách cung cấp nào trống để gán.</span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {!error && tab === NODE_TAB && (
            <div className="doc-cabinet__nodes">
              {nodeGroups.length > 0 && (
                <p className="doc-cabinet__sum">
                  {counts.done}/{counts.total} loại giấy đã có tệp
                </p>
              )}

              {nodeGroups.length === 0 && (
                <p className="doc-cabinet__empty">
                  {serviceLines.length === 0
                    ? 'Hợp đồng chưa có hạng mục nào, nên chưa có bộ giấy tờ riêng.'
                    : 'Hạng mục này chưa có loại giấy nào được gắn vào checklist.'}
                </p>
              )}

              {nodeGroups.length > 0 && visibleGroups.length === 0 && (
                <p className="doc-cabinet__empty">Không có loại giấy nào khớp từ khoá.</p>
              )}

              {visibleGroups.map(group => {
                const key = groupKey(group)
                const opened = openedNodes.has(key)
                const unassigned = !group.node_code
                return (
                  <section
                    className={`doc-cabinet__group${unassigned ? ' is-none' : ''}`}
                    key={key}
                  >
                    <button
                      type="button"
                      className="doc-cabinet__group-head"
                      aria-expanded={opened}
                      onClick={() => toggleNode(key)}
                    >
                      <b className="doc-cabinet__group-code">
                        {group.node_code || 'chưa gán bước'}
                      </b>
                      <span className="doc-cabinet__group-name">
                        {group.node_name
                          || 'Giấy chưa bước nào nhận — không hiện ở màn nhân viên nào'}
                      </span>
                      <span className="doc-cabinet__group-count">
                        {group.done}/{group.total}
                      </span>
                      <span className="doc-cabinet__group-chev" aria-hidden="true">
                        {opened ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>

                    {opened && (
                      <ul className="doc-cabinet__list">
                        {group.documents.map(doc => {
                          const hasFile = (doc.file_count || 0) > 0
                          const firstFile = (doc.files || [])[0]
                          const copy = describeCopy(doc)
                          return (
                            <li key={doc.template_id} className="doc-cabinet__row">
                              <div className="doc-cabinet__main">
                                {hasFile && firstFile ? (
                                  <button
                                    type="button"
                                    className="doc-cabinet__name-btn"
                                    onClick={() => openFile(firstFile.id, doc.name, firstFile.content_type)}
                                    title="Bấm để xem tệp"
                                  >
                                    {doc.name}
                                  </button>
                                ) : (
                                  <span className="doc-cabinet__name">{doc.name}</span>
                                )}
                                <span className="doc-cabinet__meta">
                                  <span className="doc-cabinet__src">
                                    {SOURCE_SHORT[doc.source] || doc.source_label || doc.source}
                                  </span>
                                  {hasFile && <span>{doc.file_count} tệp</span>}
                                  {doc.is_required && <span>Bắt buộc</span>}
                                  {copy && <span>{copy}</span>}
                                </span>
                              </div>
                              <span
                                className={`doc-cabinet__status${hasFile ? ' is-done' : ''}`}
                              >
                                {doc.is_waived
                                  ? 'Đã miễn'
                                  : (hasFile ? (doc.status_label || 'Đã nhận') : 'Chưa có')}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}

      <FilePreviewModal
        open={Boolean(preview)}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
        onClose={() => setPreview(null)}
      />
    </section>
  )
}
