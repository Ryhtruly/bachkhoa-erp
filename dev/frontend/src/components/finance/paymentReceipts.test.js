import { describe, expect, it } from 'vitest'
import {
  buildPaymentFormData,
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
})
