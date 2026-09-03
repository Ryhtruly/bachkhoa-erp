import { Archive, Eye, File, FileCode, FileText, FolderOpen, Paperclip } from 'lucide-react'

const iconFor = (name = '') => {
  const lower = name.toLowerCase()
  if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) {
    return { Icon: Archive, tone: 'is-archive' }
  }
  if (lower.endsWith('.dwg') || lower.endsWith('.dxf') || lower.endsWith('.dgn')) {
    return { Icon: FileCode, tone: 'is-cad' }
  }
  if (lower.endsWith('.pdf')) {
    return { Icon: FileText, tone: 'is-pdf' }
  }
  return { Icon: File, tone: 'is-file' }
}

const displayName = (file, index) => file?.file_name || file?.name || file?.filename || `Tài liệu ${index + 1}`

export default function EiwAttachmentsCard({ files = [], onOpenFile, onOpenCabinet, onUploadOutput }) {
  const normalized = Array.isArray(files) ? files : []

  return (
    <section className="eiw-attachments" id="card-attachments" aria-label="Tủ hồ sơ đính kèm">
      <header className="eiw-attachments__head">
        <span><FolderOpen size={15} /> Tủ hồ sơ đính kèm</span>
        <button type="button" className="eiw-link eiw-attachments__upload" onClick={onUploadOutput}>
          + Tải file lên
        </button>
      </header>

      {normalized.length === 0 ? (
        <p className="eiw-attachments__empty">Chưa có tài liệu kế thừa cho bước này.</p>
      ) : (
        <ul className="eiw-attachments__list">
          {normalized.map((file, index) => {
            const { Icon, tone } = iconFor(displayName(file, index))
            const target = file?.object_key || file?.file_key || file?.url || file?.evidence_url
            return (
              <li key={`${target || displayName(file, index)}-${index}`} className="eiw-attachment">
                <div className="eiw-attachment__left">
                  <span className={`eiw-attachment__icon ${tone}`}><Icon size={16} strokeWidth={1.8} /></span>
                  <div className="eiw-attachment__meta">
                    <strong className="eiw-attachment__name" title={displayName(file, index)}>{displayName(file, index)}</strong>
                    <small>{file?.size || file?.file_size || file?.uploaded_at || 'Tài liệu hồ sơ'}</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="eiw-attachment__open"
                  aria-label={`Xem ${displayName(file, index)}`}
                  onClick={() => onOpenFile?.(file)}
                >
                  <Eye size={13} /> Xem
                </button>

              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="eiw-attachments__cabinet" onClick={onOpenCabinet}>
        <Paperclip size={13} /> Mở tủ hồ sơ theo bước
      </button>
    </section>
  )
}


