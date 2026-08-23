import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('Modal accessibility behavior', () => {
  it('focuses the close action and restores the trigger focus when closed', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Mở modal</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Xác nhận">
            Nội dung
          </Modal>
        </>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Mở modal' })
    trigger.focus()
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus()
    })
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.body.style.overflow).toBe('')
  })
})

it('does not close an in-flight modal through the overlay', () => {
  const onClose = vi.fn()
  render(
    <Modal open onClose={onClose} closeOnOverlay={false} title="Đang xử lý">
      Nội dung
    </Modal>,
  )

  fireEvent.click(screen.getByRole('dialog'))
  expect(onClose).not.toHaveBeenCalled()
})
