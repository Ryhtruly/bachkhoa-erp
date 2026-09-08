import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderArchive, X } from 'lucide-react'

import FilePreviewModal from '../../components/ui/FilePreviewModal'
import { getAccessToken } from '../../lib/api'
import NodeDocumentCabinet from './NodeDocumentCabinet'
import './priorDocumentsDrawer.css'

const errorMessage = error => {
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang.'
  if (error?.status === 403) return 'Bạn không có quyền xem tệp này.'
  if (error?.status === 404) return 'Tệp này không tồn tại hoặc đã bị xóa.'
  return error?.message || 'Không mở được tệp.'
}

export default function PriorDocumentsDrawer({
  open,
  taskNodeId,
  contractId,
  serviceLineId,
  currentNodeCode,
  onClose,
  onOpenDocument,
}) {
  const [preview, setPreview] = useState(null)
  const [openError, setOpenError] = useState('')
  const objectUrlRef = useRef(null)

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  // Khóa cuộn trang khi drawer mở
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  // Thoát drawer bằng Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        if (preview) {
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
          setPreview(null)
        } else {
          onClose?.()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, preview, onClose])

  const openFile = useCallback(async file => {
    if (onOpenDocument) {
      onOpenDocument(file)
      return
    }
    const documentId = file?.document_id || file?.id
    if (!taskNodeId || !documentId) return
    setOpenError('')
    try {
      const token = getAccessToken()
      const response = await fetch(
        `/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}`
        + `/documents/${encodeURIComponent(documentId)}/file`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const error = new Error(body?.detail || `HTTP ${response.status}`)
        error.status = response.status
        throw error
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
    } catch (error) {
      setOpenError(errorMessage(error))
    }
  }, [onOpenDocument, taskNodeId])

  const closePreview = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setPreview(null)
  }

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      onClose?.()
    }
  }

  if (!open) return null

  const content = (
    <aside
      className="prior-drawer-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Tủ hồ sơ theo bước"
    >
      <div
        className="prior-drawer"
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        <header className="prior-drawer__head">
          <div className="prior-drawer__title-wrap">
            <div className="prior-drawer__icon" aria-hidden="true">
              <FolderArchive size={20} />
            </div>
            <div className="prior-drawer__titles">
              <h2 className="prior-drawer__title">Tủ hồ sơ theo bước</h2>
              <p className="prior-drawer__subtitle">
                {contractId ? `Hồ sơ nghiệm thu · HĐ ${contractId}` : 'Hồ sơ nghiệm thu qua từng bước'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="prior-drawer__close"
            onClick={onClose}
            aria-label="Đóng tủ hồ sơ"
          >
            <X size={18} />
          </button>
        </header>

        <div className="prior-drawer__body">
          {openError && <p className="prior-drawer__msg is-error" role="alert">{openError}</p>}
          <NodeDocumentCabinet
            contractId={contractId}
            serviceLineId={serviceLineId}
            currentNodeCode={currentNodeCode}
            onOpenDocument={openFile}
          />
        </div>

        <footer className="prior-drawer__foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Đóng
          </button>
        </footer>
      </div>

      <FilePreviewModal
        open={Boolean(preview)}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
        onClose={closePreview}
      />
    </aside>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
