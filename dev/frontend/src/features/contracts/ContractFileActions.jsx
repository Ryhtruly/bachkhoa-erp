import { useRef, useState } from 'react'
import { FileText, Loader2, Upload } from 'lucide-react'

import { getAccessToken } from '../../lib/api'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Hai nút thao tác trên file hợp đồng đã ký: xem và thay bản mới.
 *
 * Thay cho card lớn "Tài liệu hợp đồng" cũ — card đó chiếm gần một phần ba
 * chiều cao sidebar chỉ để nói một câu và bày một nút, trong khi phần dưới là
 * tủ hồ sơ mới cần chỗ.
 *
 * Cố ý KHÔNG có nút sửa thông tin hợp đồng (khách hàng, ngày ký, giá trị): hệ
 * thống chưa có màn đó, và dựng nó nằm ngoài phạm vi sidebar.
 *
 * Nút tải lên mở file picker của hệ điều hành bằng `<input type="file">` ẩn:
 * đây là cách duy nhất chạy đúng trên cả macOS lẫn Windows mà không cần quyền
 * gì thêm. Không dùng drag-drop làm đường chính vì bàn phím không thao tác được.
 */
export default function ContractFileActions({ contractId, fileLink, onView, onUploaded, addToast }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (event) => {
    const file = event.target.files?.[0]
    // Xoá value ngay để chọn lại ĐÚNG file vừa chọn vẫn kích hoạt onChange.
    event.target.value = ''
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.docx')) {
      addToast?.('Chỉ nhận file .docx', 'error')
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(
        `${API}/api/contracts/${encodeURIComponent(contractId)}/file`,
        { method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: form },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || 'Không tải lên được file hợp đồng.')
      }
      const result = await response.json()
      addToast?.(`Đã cập nhật file hợp đồng: ${file.name}`, 'success')
      onUploaded?.(result?.data || null)
    } catch (uploadError) {
      addToast?.(uploadError.message || 'Không tải lên được file hợp đồng.', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="contract-file-actions">
      <button
        type="button"
        className="contract-file-actions__view"
        disabled={!fileLink}
        onClick={() => fileLink && onView?.(fileLink)}
        title={fileLink ? 'Mở xem file hợp đồng hiện tại' : 'Chưa có file hợp đồng'}
      >
        <FileText size={14} />
        <span>Xem hợp đồng</span>
      </button>

      <button
        type="button"
        className="contract-file-actions__upload"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading
          ? <><Loader2 size={13} className="contract-file-actions__spin" /> Đang tải…</>
          : <><Upload size={13} /> Tải lên file mới</>}
      </button>

      <input
        ref={inputRef}
        type="file"
        className="contract-file-actions__input"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={upload}
      />
    </div>
  )
}
