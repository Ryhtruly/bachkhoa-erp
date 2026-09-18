import { describe, expect, it } from 'vitest'
import {
  buildPaymentFormData,
  compressReceiptImage,
  MAX_RECEIPT_BYTES,
  validateReceiptSelection,
} from './paymentReceipts'

const file = (name, type, size = 16) => new File([new Uint8Array(size)], name, { type, lastModified: 1 })

describe('payment receipt selection', () => {
  it('accepts supported files and rejects files over 5 MB', () => {
    const valid = file('bill.png', 'image/png')
    const tooLarge = file('large.pdf', 'application/pdf', MAX_RECEIPT_BYTES + 1)
    const result = validateReceiptSelection([], [valid, tooLarge])

    expect(result.files).toEqual([valid])
    expect(result.errors[0]).toContain('5 MB')
  })

  it('builds multipart data without manually setting a content type', () => {
    const receipt = file('bill.pdf', 'application/pdf')
    const data = buildPaymentFormData({
      amount: '12000000',
      payment_method: 'Chuyển khoản',
      note: 'Đợt 1',
    }, [receipt])

    expect(data.get('amount')).toBe('12000000')
    expect(data.get('payment_method')).toBe('Chuyển khoản')
    expect(data.get('note')).toBe('Đợt 1')
    expect(data.getAll('receipt_files')).toHaveLength(1)
  })

  it('keeps non-image files such as PDF untouched', async () => {
    const pdf = file('invoice.pdf', 'application/pdf', 1024 * 1024)
    const result = await compressReceiptImage(pdf)
    expect(result).toBe(pdf)
  })

  it('keeps small images under 600KB untouched', async () => {
    const smallImg = file('receipt.jpg', 'image/jpeg', 200 * 1024)
    const result = await compressReceiptImage(smallImg)
    expect(result).toBe(smallImg)
  })

  it('handles null/undefined gracefully', async () => {
    expect(await compressReceiptImage(null)).toBeNull()
    expect(await compressReceiptImage(undefined)).toBeUndefined()
  })
})
