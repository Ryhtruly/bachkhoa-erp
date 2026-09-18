export const MAX_RECEIPT_FILES = 5
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|pdf)$/i

export const formatFileSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const validateReceiptSelection = (currentFiles, selectedFiles) => {
  const accepted = [...currentFiles]
  const errors = []

  for (const file of selectedFiles) {
    if (accepted.length >= MAX_RECEIPT_FILES) {
      errors.push(`Chỉ được chọn tối đa ${MAX_RECEIPT_FILES} tệp cho mỗi đợt thanh toán.`)
      break
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      errors.push(`${file.name}: vượt quá giới hạn 5 MB.`)
      continue
    }
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.test(file.name)) {
      errors.push(`${file.name}: chỉ chấp nhận JPG, PNG, WEBP hoặc PDF.`)
      continue
    }
    const duplicate = accepted.some((item) =>
      item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
    if (!duplicate) accepted.push(file)
  }

  return { files: accepted, errors }
}

export const buildPaymentFormData = (form, receiptFiles) => {
  const data = new FormData()
  data.append('amount', String(Number(form.amount)))
  data.append('payment_method', form.payment_method || 'Tiền mặt')
  if (form.payer_name?.trim()) data.append('payer_name', form.payer_name.trim())
  if (form.note?.trim()) data.append('note', form.note.trim())
  receiptFiles.forEach((file) => data.append('receipt_files', file, file.name))
  return data
}

export const compressReceiptImage = async (file) => {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file
  }
  // File dưới 600KB thì giữ nguyên
  if (file.size <= 600 * 1024) {
    return file
  }
  // Nếu môi trường không hỗ trợ Image / Canvas (JSDOM/SSR)
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.Image) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        let { width, height } = img
        const maxDim = 1600
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)

        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file)
            } else {
              const compressedFile = new File([blob], file.name, {
                type: blob.type || outputType,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            }
          },
          outputType,
          0.82
        )
      } catch {
        resolve(file)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}
