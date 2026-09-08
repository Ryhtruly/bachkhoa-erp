import { useCallback, useEffect, useRef, useState } from 'react'
import { FileImage, FileSpreadsheet, FileText, FolderOpen, Lock, Trash2, Upload } from 'lucide-react'

import { apiFetch, getAccessToken } from '../../lib/api'

const API = import.meta.env.VITE_API_URL || ''

const sizeLabel = (bytes) => {
  const size = Number(bytes || 0)
  if (size >= 1_048_576) return `${(size / 1_048_576).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

const dateLabel = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function FileIcon({ name, contentType }) {
  const lower = `${name || ''}`.toLowerCase()
  if ((contentType || '').startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(lower)) {
    return <FileImage size={17} className="dd-icon is-image" />
  }
  if (/\.(xlsx?|csv)$/.test(lower)) return <FileSpreadsheet size={17} className="dd-icon is-sheet" />
  return <FileText size={17} className="dd-icon is-doc" />
}

/**
 * Kho giấy tờ của một Hồ sơ pháp lý, chia ba ngăn theo giai đoạn của chuỗi K.
 * Chỉ ngăn của bước ĐANG chạy mới nhận thêm tệp — máy chủ cũng chặn như vậy,
 * đây chỉ là lớp hiển thị cho khớp.
 */
export default function DossierDocuments({ dossierId, addToast, onChanged }) {
  const [store, setStore] = useState(null)
  const [error, setError] = useState('')
  const [busyStage, setBusyStage] = useState('')
  const [openStage, setOpenStage] = useState(null)
  const inputRefs = useRef({})

  const load = useCallback(async () => {
    if (!dossierId) return
    try {
      const data = await apiFetch(`/api/legal-dossiers/${dossierId}/documents`)
      setStore(data)
      setError('')
      setOpenStage(current => current || data.active?.stage || data.folders?.[0]?.stage || null)
    } catch (requestError) {
      setError(requestError.message || 'Không tải được kho giấy tờ.')
    }
  }, [dossierId])

  useEffect(() => { load() }, [load])

  if (!dossierId) return null

  const upload = async (stage, fileList) => {
    const file = fileList?.[0]
    if (!file) return
    setBusyStage(stage)
    try {
      const body = new FormData()
      body.append('stage', stage)
      body.append('file', file)
      const response = await fetch(`${API}/api/legal-dossiers/${dossierId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || 'Không lưu được tệp.')
      addToast?.(`Đã lưu ${file.name}`, 'success')
      await load()
      onChanged?.()
    } catch (uploadError) {
      addToast?.(uploadError.message || 'Không lưu được tệp.', 'error')
    } finally {
      setBusyStage('')
      if (inputRefs.current[stage]) inputRefs.current[stage].value = ''
    }
  }

  const remove = async (documentId, fileName) => {
    if (!window.confirm(`Gỡ "${fileName}" khỏi hồ sơ? Tệp sẽ bị xoá khỏi kho lưu trữ.`)) return
    try {
      await apiFetch(`/api/legal-dossiers/documents/${documentId}`, { method: 'DELETE' })
      addToast?.('Đã gỡ tệp', 'success')
      await load()
      onChanged?.()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không gỡ được tệp.', 'error')
    }
  }

  const open = async (documentId, fileName) => {
    try {
      const response = await fetch(`${API}/api/legal-dossiers/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) throw new Error('Không mở được tệp.')
      // Bucket là private nên không có link trực tiếp — tải qua máy chủ rồi mở
      // bằng blob URL, giống cách các tệp riêng tư khác trong hệ thống.
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (openError) {
      addToast?.(openError.message || 'Không mở được tệp.', 'error')
    }
  }

  const folders = store?.folders || []
  const activeStage = store?.active?.stage || null

  return <section className="dd" aria-label="Kho giấy tờ hồ sơ">
    <header className="dd-head">
      <h3><FolderOpen size={17} /> Kho giấy tờ hồ sơ</h3>
      <span>
        {activeStage
          ? <>Đang mở ngăn <strong>{store.active.node_code}</strong> — chỉ ngăn này nhận thêm tệp</>
          : 'Không có bước pháp lý nào đang chạy — kho ở chế độ chỉ đọc'}
      </span>
    </header>

    {error && <p className="dd-error" role="alert">{error}</p>}
    {!store && !error && <p className="dd-loading">Đang tải kho giấy tờ…</p>}

    {folders.map((folder) => {
      const expanded = openStage === folder.stage
      const canUpload = folder.stage === activeStage
      return <article key={folder.stage} className={`dd-folder${expanded ? ' is-open' : ''}`}>
        <button
          type="button"
          className="dd-folder__bar"
          onClick={() => setOpenStage(expanded ? null : folder.stage)}
          aria-expanded={expanded}
        >
          <FolderOpen size={16} />
          <strong>{folder.label}</strong>
          <em>{folder.node_label}</em>
          <span className="dd-folder__count">{folder.documents.length} tệp</span>
          {canUpload
            ? <span className="dd-folder__state is-open">Đang mở</span>
            : <span className="dd-folder__state"><Lock size={11} /> Khoá</span>}
        </button>

        {expanded && <div className="dd-folder__body">
          {folder.documents.length === 0 && (
            <p className="dd-empty">Chưa có giấy tờ nào trong ngăn này.</p>
          )}

          {folder.documents.map(document => <div key={document.id} className="dd-file">
            <FileIcon name={document.file_name} contentType={document.content_type} />
            <button type="button" className="dd-file__name" onClick={() => open(document.id, document.file_name)}>
              {document.file_name}
            </button>
            <span className="dd-file__meta">
              {sizeLabel(document.size_bytes)}
              {document.uploaded_by_name ? ` · ${document.uploaded_by_name}` : ''}
              {document.uploaded_at ? ` · ${dateLabel(document.uploaded_at)}` : ''}
            </span>
            <button
              type="button"
              className="dd-file__remove"
              title="Gỡ tệp khỏi hồ sơ"
              onClick={() => remove(document.id, document.file_name)}
            >
              <Trash2 size={14} />
            </button>
          </div>)}

          {canUpload ? (
            <label className="dd-upload">
              <input
                ref={(element) => { inputRefs.current[folder.stage] = element }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                onChange={(event) => upload(folder.stage, event.target.files)}
                disabled={busyStage === folder.stage}
              />
              <Upload size={15} />
              {busyStage === folder.stage ? 'Đang tải lên…' : 'Chọn tệp để lưu vào ngăn này'}
            </label>
          ) : (
            <p className="dd-locked">
              <Lock size={13} />
              Ngăn này chỉ mở khi hạng mục chạy tới <strong>{folder.node_label}</strong>.
            </p>
          )}
        </div>}
      </article>
    })}
  </section>
}
