import { useEffect, useRef, useState } from 'react'
import { Download, FileText, ExternalLink } from 'lucide-react'
import { renderAsync } from 'docx-preview'

import Modal from './Modal'
import './filePreviewModal.css'

const IMAGE_EXTENSIONS = /\.(?:avif|gif|heic|jpeg|jpg|png|svg|webp)$/i
const PDF_EXTENSION = /\.pdf$/i
// Chỉ .docx thôi. docx-preview đọc gói OOXML; .doc là định dạng nhị phân đời cũ,
// ném vào đây chỉ ra lỗi phân tích — loại đó vẫn đi đường tải xuống.
const DOCX_EXTENSION = /\.docx$/i
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export default function FilePreviewModal({ open, fileName = '', mimeType = '', url = '', onClose }) {
  const normalizedType = String(mimeType || '').toLowerCase()
  const isImage = normalizedType.startsWith('image/') || IMAGE_EXTENSIONS.test(fileName)
  const isPdf = normalizedType === 'application/pdf' || PDF_EXTENSION.test(fileName)
  const isDocx = normalizedType === DOCX_MIME || DOCX_EXTENSION.test(fileName)

  const docxSurfaceRef = useRef(null)
  const [docxState, setDocxState] = useState('idle')

  useEffect(() => {
    if (!open || !isDocx || !url) return undefined
    const surface = docxSurfaceRef.current
    if (!surface) return undefined

    let dangHieuLuc = true
    surface.innerHTML = ''
    setDocxState('loading')

    // Cả hai nơi gọi đều truyền blob: URL (tệp vừa chọn trong form, hoặc tệp đã
    // tải về kèm token), nên fetch thẳng được — không cần đính kèm xác thực.
    fetch(url)
      .then(response => response.blob())
      .then(blob => (dangHieuLuc ? renderAsync(blob, surface, null, { inWrapper: true }) : undefined))
      .then(() => { if (dangHieuLuc) setDocxState('ready') })
      .catch(() => { if (dangHieuLuc) setDocxState('error') })

    return () => {
      dangHieuLuc = false
      surface.innerHTML = ''
    }
  }, [open, isDocx, url])

  // Word hỏng hoặc lạ thì rơi về khối thông báo cũ — vẫn còn nút tải xuống,
  // không để người dùng đối diện một ô trắng không giải thích gì.
  const docxHong = isDocx && docxState === 'error'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Xem tài liệu ${fileName}`}
      size="xl"
      id="file-preview-modal"
      overlayClassName="file-preview-overlay"
    >
      <div className="file-preview">
        {isImage && url ? (
          <img className="file-preview__image" src={url} alt={fileName} />
        ) : isPdf && url ? (
          <iframe className="file-preview__pdf" src={url} title={`Xem trước ${fileName}`} />
        ) : isDocx && url && !docxHong ? (
          <>
            {docxState === 'loading' && (
              <p className="file-preview__status">Đang dựng nội dung Word…</p>
            )}
            <div
              ref={docxSurfaceRef}
              className="file-preview__docx"
              aria-busy={docxState === 'loading'}
              aria-label={`Nội dung ${fileName}`}
            />
          </>
        ) : (
          <div className="file-preview__fallback">
            <span className="file-preview__icon"><FileText size={30} /></span>
            <div>
              <strong>{fileName}</strong>
              <p>
                {docxHong
                  ? 'Không dựng được nội dung tệp Word này. Hãy tải xuống để mở bằng Word.'
                  : 'Định dạng này không hỗ trợ xem trực tiếp ổn định trong trình duyệt.'}
              </p>
            </div>
          </div>
        )}

        {url && (
          <div className="file-preview__actions">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Mở trong tab mới
            </a>
            <a href={url} download={fileName}>
              <Download size={16} /> Tải xuống
            </a>
          </div>
        )}
      </div>
    </Modal>
  )
}
