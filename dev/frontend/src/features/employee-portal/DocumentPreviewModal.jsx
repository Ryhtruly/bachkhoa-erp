import { useState, useEffect, useRef } from 'react'
import {
  X,
  Download,
  FileText,
  FileCode,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react'
import { renderAsync } from 'docx-preview'
import './documentPreviewModal.css'

const IMAGE_EXTENSIONS = /\.(?:avif|gif|heic|jpeg|jpg|png|svg|webp)$/i
const PDF_EXTENSION = /\.pdf$/i
const DOCX_EXTENSION = /\.docx$/i
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const formatBytes = (bytes) => {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return ''
  const mb = size / (1024 * 1024)
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const renderFileIcon = (ext) => {
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif', 'heic'].includes(ext)) {
    return <ImageIcon size={20} color="#059669" />
  }
  if (['dwg', 'dxf', 'dgn'].includes(ext)) {
    return <FileCode size={20} color="#0891b2" />
  }
  return <FileText size={20} color="#2563eb" />
}

/**
 * Trình xem tài liệu chỉ đọc, trung thực.
 * Chỉ hiển thị đúng dữ liệu thật do cha (EmployeeItemWorkspace) truyền vào:
 * - PDF/Ảnh: dùng đúng `url` (blob URL đã xác thực).
 * - DOCX: dùng docx-preview với `blob`/`url` thật.
 * - Định dạng khác (DWG/DXF/DGN…): báo không xem trước được + giữ hành động mở/tải thật.
 * - Không có tệp: hiện trạng thái rỗng trung thực.
 * Không upload, không preset, không nội dung/kiểm định/chữ ký bịa.
 */
export default function DocumentPreviewModal({
  open = false,
  fileName = '',
  mimeType = '',
  url = '',
  blob = null,
  doc = null,
  onClose,
}) {
  const docxSurfaceRef = useRef(null)
  const [docxState, setDocxState] = useState('idle')

  const currentFileName =
    fileName || doc?.name || doc?.file_name || doc?.fileName || 'Tài liệu'
  // previewUrl chỉ được lấy từ `url` đã xác thực do cha truyền vào.
  // Không dùng doc?.url (có thể là object URL riêng tư) làm nguồn xem trước/tải về.
  const previewUrl = url || ''
  const hasSource = Boolean(previewUrl) || Boolean(blob)

  const normalizedType = String(mimeType || doc?.mimeType || '').toLowerCase()
  const rawExt = currentFileName.includes('.')
    ? currentFileName.split('.').pop().toLowerCase()
    : ''

  const isImage = normalizedType.startsWith('image/') || IMAGE_EXTENSIONS.test(currentFileName)
  const isPdf = normalizedType === 'application/pdf' || PDF_EXTENSION.test(currentFileName)
  const isDocx = normalizedType === DOCX_MIME || DOCX_EXTENSION.test(currentFileName)

  const subtitleLabel = doc?.name || doc?.slot_name || ''
  const sizeLabel = blob ? formatBytes(blob.size) : formatBytes(doc?.file_size ?? doc?.fileSize)
  const subtitle = [subtitleLabel, sizeLabel].filter(Boolean).join(' • ')

  // Đóng bằng phím Escape.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Dựng tài liệu Word (.docx) từ dữ liệu thật.
  useEffect(() => {
    if (!open || !isDocx || (!previewUrl && !blob)) return undefined
    const surface = docxSurfaceRef.current
    if (!surface) return undefined

    let stillValid = true
    surface.innerHTML = ''
    setDocxState('loading')

    const renderDocument = async () => {
      let documentBlob = blob
      if (!documentBlob) {
        const response = await fetch(previewUrl)
        if (response.ok === false) throw new Error('Không tải được nội dung tài liệu Word.')
        documentBlob = await response.blob()
      }
      if (!documentBlob || documentBlob.size <= 0) throw new Error('Tệp Word rỗng.')
      if (!stillValid) return
      await renderAsync(documentBlob, surface, null, { inWrapper: true, useBase64URL: true })
      if (stillValid) setDocxState('ready')
    }

    renderDocument().catch(() => {
      if (stillValid) setDocxState('error')
    })

    return () => {
      stillValid = false
      surface.innerHTML = ''
    }
  }, [open, isDocx, previewUrl, blob])

  if (!open) return null

  let viewport
  if (!hasSource) {
    viewport = (
      <div className="dpm-doc-state dpm-doc-empty">
        <FileText size={28} color="#94a3b8" />
        <p>Chưa có tệp để xem trước.</p>
      </div>
    )
  } else if (isPdf && previewUrl) {
    viewport = (
      <iframe className="dpm-preview-iframe" src={previewUrl} title={currentFileName} />
    )
  } else if (isImage && previewUrl) {
    viewport = (
      <div className="dpm-img-wrapper">
        <img className="dpm-preview-img" src={previewUrl} alt={currentFileName} />
      </div>
    )
  } else if (isDocx && (blob || previewUrl) && docxState !== 'error') {
    viewport = <div className="dpm-docx-surface" ref={docxSurfaceRef} />
  } else {
    viewport = (
      <div className="dpm-doc-state dpm-doc-unsupported">
        <FileCode size={28} color="#0891b2" />
        <p>Không thể xem trước định dạng này trên trình duyệt.</p>
        {previewUrl && (
          <a
            className="dpm-doc-open-link"
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            download={currentFileName}
          >
            <ExternalLink size={14} />
            <span>Mở tệp trong tab mới</span>
          </a>
        )}
      </div>
    )
  }

  return (
    <div
      className="dpm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem tài liệu ${currentFileName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="dpm-dialog">
        {/* Tiêu đề ẩn cho trình đọc màn hình / kiểm thử */}
        <span className="dpm-sr-only">Xem tài liệu {currentFileName}</span>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="dpm-header">
          <div className="dpm-header-left">
            <div className="dpm-icon-box">
              {renderFileIcon(rawExt)}
            </div>
            <div className="dpm-header-info">
              <div className="dpm-title-row">
                <h3 className="dpm-file-name">{currentFileName}</h3>
                {rawExt && <span className="dpm-ext-badge">{rawExt}</span>}
              </div>
              {subtitle && <p className="dpm-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="dpm-header-actions">
            {previewUrl && (
              <a
                className="dpm-btn-download"
                href={previewUrl}
                download={currentFileName}
                target="_blank"
                rel="noreferrer"
                title="Tải tệp về máy"
              >
                <Download size={14} />
                <span>Tải về</span>
              </a>
            )}
            <button
              type="button"
              className="dpm-btn-close"
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              title="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ── Modal Body ──────────────────────────────────────────────────── */}
        <div className="dpm-body">
          <div className="dpm-file-preview-wrap">
            <div className="dpm-doc-viewport">
              {viewport}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="dpm-footer">
          <span>Hệ thống Quản lý Quy trình Đo đạc Địa chính 2026</span>
          <button
            type="button"
            onClick={onClose}
            className="dpm-btn-footer-close"
          >
            Đóng
          </button>
        </footer>
      </div>
    </div>
  )
}
