import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReceiptLinks from './ReceiptLinks'

describe('ReceiptLinks', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders nothing when no attachments', () => {
    const { container } = render(<ReceiptLinks attachments={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders external links directly as anchor tags', () => {
    render(
      <ReceiptLinks
        attachments={[{ id: 'ext-1', filename: 'Hóa đơn đỏ.pdf', url: 'https://example.com/bill.pdf' }]}
      />
    )
    const link = screen.getByRole('link', { name: /Hóa đơn đỏ\.pdf/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://example.com/bill.pdf')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('opens protected attachments in portaled modal on document.body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['dummy content'], { type: 'image/webp' })),
    })

    render(
      <ReceiptLinks
        attachments={[{ id: 'rec-1', filename: 'bill_thu_tien.webp', url: '/api/handover/payment-receipts/rec-1' }]}
        compact
      />
    )

    const button = screen.getByRole('button', { name: '1' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByText('bill_thu_tien.webp')).toBeInTheDocument()

    // Press Escape to close
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
