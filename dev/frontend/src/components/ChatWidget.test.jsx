import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatWidget from './ChatWidget'
import * as apiModule from '../lib/api'

describe('ChatWidget', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders the floating open button initially', () => {
    render(<ChatWidget />)
    const openBtn = screen.getByRole('button', { name: 'Mở trợ lý nội bộ' })
    expect(openBtn).toBeInTheDocument()
    expect(openBtn).toBeVisible()
  })

  it('opens the chat window when floating button is clicked', async () => {
    render(<ChatWidget />)
    const openBtn = screen.getByRole('button', { name: 'Mở trợ lý nội bộ' })
    fireEvent.click(openBtn)

    expect(screen.getByText('Trợ lý Nội bộ')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nhập câu hỏi của bạn...')).toBeInTheDocument()
  })

  it('sends message via apiFetch and displays assistant response', async () => {
    const apiFetchSpy = vi.spyOn(apiModule, 'apiFetch').mockResolvedValue({
      status: 'success',
      reply: 'Chào bạn! Tôi có thể giúp bạn giải đáp các quy trình nội bộ.',
    })

    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý nội bộ' }))

    const input = screen.getByPlaceholderText('Nhập câu hỏi của bạn...')
    fireEvent.change(input, { target: { value: 'Quy trình ký hợp đồng như thế nào?' } })

    const form = input.closest('form')
    fireEvent.submit(form)

    expect(screen.getByText('Quy trình ký hợp đồng như thế nào?')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Tôi có thể giúp bạn giải đáp các quy trình nội bộ.')).toBeInTheDocument()
    })

    expect(apiFetchSpy).toHaveBeenCalledWith(
      '/api/ai/chat',
      expect.objectContaining({
        method: 'POST',
        timeout: 45000,
      })
    )
  })

  it('displays error message if apiFetch fails', async () => {
    vi.spyOn(apiModule, 'apiFetch').mockRejectedValue(new Error('Chưa cấu hình API Key'))

    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý nội bộ' }))

    const input = screen.getByPlaceholderText('Nhập câu hỏi của bạn...')
    fireEvent.change(input, { target: { value: 'Test lỗi' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => {
      expect(screen.getByText('Chưa cấu hình API Key')).toBeInTheDocument()
    })
  })

  it('closes the chat window when X button is clicked', async () => {
    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý nội bộ' }))

    expect(screen.getByText('Trợ lý Nội bộ')).toBeInTheDocument()

    // Click close button
    const closeButtons = screen.getAllByRole('button')
    // Find the one that has SVG X
    const closeBtn = closeButtons.find(btn => !btn.getAttribute('title') && btn.querySelector('.lucide-x'))
    expect(closeBtn).toBeDefined()
    fireEvent.click(closeBtn)

    expect(screen.queryByText('Trợ lý Nội bộ')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở trợ lý nội bộ' })).toBeVisible()
  })

  it('clears conversation history when trash button is clicked', async () => {
    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý nội bộ' }))

    const trashBtn = screen.getByTitle('Xóa lịch sử trò chuyện')
    fireEvent.click(trashBtn)

    expect(screen.getByText(/Tôi là trợ lý AI nội bộ/i)).toBeInTheDocument()
  })
})
