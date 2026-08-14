import { FileText, Paperclip } from 'lucide-react'
import { useState } from 'react'

const normalizedAttachments = (attachments, legacyUrl) => {
  if (Array.isArray(attachments) && attachments.length > 0) return attachments
  return legacyUrl ? [{ id: 'legacy', filename: 'Bill / biên lai', url: legacyUrl }] : []
}

export default function ReceiptLinks({ attachments, legacyUrl, addToast, compact = false }) {
  const [openingId, setOpeningId] = useState(null)
  const items = normalizedAttachments(attachments, legacyUrl)

  const openProtected = async (item) => {
    const preview = window.open('about:blank', '_blank')
    if (preview) preview.opener = null
    setOpeningId(item.id)
    try {
      const response = await fetch(item.url)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Không mở được bill/biên lai')
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      if (preview) preview.location.replace(objectUrl)
      else window.open(objectUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      preview?.close()
      addToast?.(error.message || 'Không mở được bill/biên lai', 'error')
    } finally {
      setOpeningId(null)
    }
  }

  if (items.length === 0) return null

  return (
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
  )
}
