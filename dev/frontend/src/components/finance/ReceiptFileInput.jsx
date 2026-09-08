import { FileImage, FileText, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  formatFileSize,
  MAX_RECEIPT_FILES,
  validateReceiptSelection,
} from './paymentReceipts'
import './receipts.css'

export default function ReceiptFileInput({ files, onChange, disabled = false }) {
  const inputRef = useRef(null)
  const [errors, setErrors] = useState([])

  const selectFiles = (event) => {
    const result = validateReceiptSelection(files, Array.from(event.target.files || []))
    onChange(result.files)
    setErrors(result.errors)
    event.target.value = ''
  }

  const removeFile = (index) => {
    onChange(files.filter((_, fileIndex) => fileIndex !== index))
    setErrors([])
  }

  return (
    <div className="receipt-input">
      <input
        ref={inputRef}
        className="receipt-input__native"
        type="file"
        multiple
        disabled={disabled}
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        onChange={selectFiles}
        aria-label="Chọn ảnh bill hoặc biên lai"
      />
      <button
        type="button"
        className="receipt-input__pick"
        disabled={disabled || files.length >= MAX_RECEIPT_FILES}
        onClick={() => inputRef.current?.click()}
      >
        <Plus size={16} /> Chọn ảnh hoặc PDF
      </button>
      <small>Tối đa {MAX_RECEIPT_FILES} tệp, 5 MB/tệp. Hỗ trợ JPG, PNG, WEBP, PDF.</small>

      {files.length > 0 && (
        <ul className="receipt-input__files">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              {file.type === 'application/pdf' ? <FileText size={16} /> : <FileImage size={16} />}
              <span title={file.name}>{file.name}</span>
              <small>{formatFileSize(file.size)}</small>
              <button type="button" disabled={disabled} onClick={() => removeFile(index)} aria-label={`Bỏ ${file.name}`}>
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.map((error) => <p className="receipt-input__error" key={error}>{error}</p>)}
    </div>
  )
}
