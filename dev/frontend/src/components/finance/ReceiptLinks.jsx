import { FileText, Paperclip, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAccessToken } from '../../lib/api'

const normalizedAttachments = (attachments, legacyUrl) => {
  if (Array.isArray(attachments) && attachments.length > 0) return attachments
  return legacyUrl ? [{ id: 'legacy', filename: 'Bill / biên lai', url: legacyUrl }] : []
}

export default function ReceiptLinks({ attachments, legacyUrl, addToast, compact = false }) {
  const [openingId, setOpeningId] = useState(null)
  const [dangXem, setDangXem] = useState(null)
  const items = normalizedAttachments(attachments, legacyUrl)

  // Thu hồi địa chỉ tạm khi đóng, nếu không mỗi lần mở một bill là giữ luôn ảnh
  // đó trong bộ nhớ cho tới khi tải lại trang.
  useEffect(() => () => { if (dangXem?.objectUrl) URL.revokeObjectURL(dangXem.objectUrl) }, [dangXem])

  const openProtected = async (item) => {
    setOpeningId(item.id)
    try {
      // Ảnh bill nằm sau lớp xác thực. Thiếu header này thì máy chủ trả 401 và
      // người dùng chỉ thấy "Không mở được bill" mà không hiểu vì sao.
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
      // Mở ngay trong trang thay vì bật cửa sổ mới: Safari và Chrome trên macOS
      // chặn cửa sổ mở sau một tác vụ mạng, nên cách cũ hay im lặng không hiện gì.
      setDangXem({
        objectUrl,
        ten: item.filename || 'Bill / biên lai',
        laPdf: blob.type === 'application/pdf' || item.content_type === 'application/pdf',
      })
    } catch (error) {
      addToast?.(error.message || 'Không mở được bill/biên lai', 'error')
    } finally {
      setOpeningId(null)
    }
  }

  const dong = () => {
    if (dangXem?.objectUrl) URL.revokeObjectURL(dangXem.objectUrl)
    setDangXem(null)
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

      {dangXem && (
        <div className="bill-viewer" role="dialog" aria-modal="true" aria-label={dangXem.ten}
          onClick={dong}>
          <div className="bill-viewer__box" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{dangXem.ten}</strong>
              <a href={dangXem.objectUrl} download={dangXem.ten}>Tải về</a>
              <button type="button" onClick={dong} aria-label="Đóng"><X size={16} /></button>
            </header>
            {dangXem.laPdf
              ? <iframe title={dangXem.ten} src={dangXem.objectUrl} />
              : <img src={dangXem.objectUrl} alt={dangXem.ten} />}
          </div>
        </div>
      )}
    </>
  )
}
