import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FolderOpen } from 'lucide-react'

import FilePreviewModal from '../../components/ui/FilePreviewModal'
import ChecklistCabinetTree from '../document-cabinet/ChecklistCabinetTree'
import useChecklistCabinet from '../document-cabinet/useChecklistCabinet'
import { getAccessToken } from '../../lib/api'
import './documentCabinet.css'

const API = import.meta.env.VITE_API_URL || ''

/** Tủ hồ sơ read-only của một Hạng mục; không phải Sổ/Mẫu giấy tờ. */
export default function DocumentCabinet({ contractId, serviceLines = [], addToast, title = 'TỦ HỒ SƠ' }) {
  const [open, setOpen] = useState(true)
  const [selectedLineId, setSelectedLineId] = useState('')
  const [preview, setPreview] = useState(null)
  const objectUrlRef = useRef(null)

  // Đổi hợp đồng thì đặt lại hạng mục chọn tay để tự ăn theo hạng mục đầu của hợp đồng mới
  useEffect(() => {
    setSelectedLineId('')
  }, [contractId])

  const serviceLineId = useMemo(() => {
    if (selectedLineId && serviceLines.some(line => String(line.id) === String(selectedLineId))) {
      return selectedLineId
    }
    return serviceLines[0]?.id || ''
  }, [selectedLineId, serviceLines])

  const { groups, loading, error } = useChecklistCabinet({
    contractId,
    serviceLineId,
    fallbackToTemplates: true,
  })

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const openFile = async file => {
    const documentId = file?.document_id || file?.id
    if (!documentId) return
    try {
      const response = await fetch(
        `${API}/api/document-register/scans/${encodeURIComponent(documentId)}/download`,
        { headers: { Authorization: `Bearer ${getAccessToken()}` } },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || 'Không mở được tệp.')
      }
      const blob = await response.blob()
      if (!blob.size) throw new Error('Tệp rỗng.')
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = URL.createObjectURL(blob)
      setPreview({
        fileName: file.file_name || file.name || 'Tài liệu',
        mimeType: blob.type || file.content_type || '',
        url: objectUrlRef.current,
        blob,
      })
    } catch (openError) {
      addToast?.(openError.message || 'Không mở được tệp.', 'error')
    }
  }

  const closePreview = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setPreview(null)
  }

  return <section className={`doc-cabinet${open ? ' is-open' : ''}`} aria-label={title}>
    <button type="button" className="doc-cabinet__head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span><FolderOpen size={16} /> {title}</span>
      <span className="doc-cabinet__chevron"><ChevronDown size={16} className={open ? 'is-open' : ''} /></span>
    </button>

    {open && <div className="doc-cabinet__body">
      {serviceLines.length > 1 && <label className="doc-cabinet__scope">
        <span>Hạng mục</span>
        <select
          aria-label="Hạng mục của tủ hồ sơ"
          value={serviceLineId}
          onChange={event => setSelectedLineId(event.target.value)}
        >
          {serviceLines.map(line => <option value={line.id} key={line.id}>
            {line.name || line.task_type || line.service_type || line.id}
          </option>)}
        </select>
      </label>}
      {loading && (
        <div className="doc-cabinet__skeleton" aria-label="Đang mở tủ hồ sơ…">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 38, borderRadius: 8, marginBottom: 8 }} />
          ))}
        </div>
      )}
      {!loading && error && <p className="doc-cabinet__empty is-error">{error}</p>}
      {!loading && !error && (
        <ChecklistCabinetTree groups={groups || []} onOpenFile={openFile} />
      )}
    </div>}

    <FilePreviewModal
      open={Boolean(preview)}
      fileName={preview?.fileName || ''}
      mimeType={preview?.mimeType || ''}
      url={preview?.url || ''}
      blob={preview?.blob || null}
      onClose={closePreview}
    />
  </section>
}
