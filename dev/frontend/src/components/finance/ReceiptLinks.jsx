import { FileText, Paperclip, X } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getAccessToken } from '../../lib/api'
import './receipts.css'

const normalizedAttachments = (attachments, legacyUrl) => {
  if (Array.isArray(attachments) && attachments.length > 0) return attachments
  return legacyUrl ? [{ id: 'legacy', filename: 'Bill / biên lai', url: legacyUrl }] : []
}

export default function ReceiptLinks({ attachments, legacyUrl, addToast, compact = false }) {
  const [openingId, setOpeningId] = useState(null)
  const [previewReceipt, setPreviewReceipt] = useState(null)
  const items = normalizedAttachments(attachments, legacyUrl)

  const handleClosePreview = useCallback(() => {
    if (previewReceipt?.objectUrl) URL.revokeObjectURL(previewReceipt.objectUrl)
    setPreviewReceipt(null)
  }, [previewReceipt?.objectUrl])

  useEffect(() => () => { if (previewReceipt?.objectUrl) URL.revokeObjectURL(previewReceipt.objectUrl) }, [previewReceipt])

  useEffect(() => {
    if (!previewReceipt) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClosePreview()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewReceipt, handleClosePreview])

  const openProtected = async (item) => {
    setOpeningId(item.id)
    try {
      const token = getAccessToken()
      const response = await fetch(item.url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail
          || (response.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi mở bill.'
            : 'Không mở được bill/biên lai'))
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      setPreviewReceipt({
        objectUrl,
        filename: item.filename || 'Bill / biên lai',
        isPdf: blob.type === 'application/pdf' || item.content_type === 'application/pdf',
      })
    } catch (error) {
      addToast?.(error.message || 'Không mở được bill/biên lai', 'error')
    } finally {
      setOpeningId(null)
    }
  }

  if (items.length === 0) return null

  return (
    <>
      <span className={`receipt-links${compact ? ' receipt-links--compact' : ''}`}>
        {items.map((item, index) => {
          const label = compact ? `${index + 1}` : (item.filename || `Bill ${index + 1}`)
          const icon = item.content_type === 'application/pdf' ? <FileText size={14} /> : <Paperclip size={14} />
          if (!item.url?.startsWith('/api/')) {
            return <a key={item.id || item.url} href={item.url} target="_blank" rel="noreferrer">{icon}{label}</a>
          }
          return (
            <button key={item.id} type="button" disabled={openingId === item.id} onClick={() => openProtected(item)}>
              {icon}{openingId === item.id ? '…' : label}
            </button>
          )
        })}
      </span>

      {previewReceipt && typeof document !== 'undefined' && createPortal(
        <div className="bill-viewer" role="dialog" aria-modal="true" aria-label={previewReceipt.filename}
          onClick={handleClosePreview}>
          <div className="bill-viewer__box" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{previewReceipt.filename}</strong>
              <a href={previewReceipt.objectUrl} download={previewReceipt.filename}>Tải về</a>
              <button type="button" onClick={handleClosePreview} aria-label="Đóng"><X size={16} /></button>
            </header>
            {previewReceipt.isPdf
              ? <iframe title={previewReceipt.filename} src={previewReceipt.objectUrl} />
              : <img src={previewReceipt.objectUrl} alt={previewReceipt.filename} />}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
