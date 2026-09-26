import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { ToastProvider } from '../contexts/ToastContext'

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

function renderSettings(testResult, testStatus = 200) {
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    if (String(url).endsWith('/settings/test')) return jsonResponse(testResult, testStatus)
    if (String(url).endsWith('/settings/gemini-models')) {
      return jsonResponse({ models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, { id: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro' }] })
    }
    if (options.method === 'POST') return jsonResponse({ status: 'success' })
    return jsonResponse({ status: 'success', data: {} })
  }))
  render(<ToastProvider><Settings /></ToastProvider>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Settings', () => {
  it('shows a toast when a connection test fails', async () => {
    renderSettings({ ok: false, message: '' })

    fireEvent.click(screen.getAllByRole('button', { name: /Test kết nối/ })[0])

    expect(await screen.findByText('Kết nối thất bại')).toBeInTheDocument()
  })

  it('shows the server error detail when the test request itself fails', async () => {
    renderSettings({ detail: 'Không có quyền cập nhật cấu hình' }, 403)

    fireEvent.click(screen.getAllByRole('button', { name: /Test kết nối/ })[0])

    expect(await screen.findByText('Không có quyền cập nhật cấu hình')).toBeInTheDocument()
  })

  it('loads the Gemini models the key can use as suggestions for the chatbot model', async () => {
    renderSettings({ ok: true })

    fireEvent.click(screen.getByRole('button', { name: /Tải danh sách model/ }))

    expect(await screen.findByText(/Có 2 model/)).toBeInTheDocument()
    const input = screen.getByLabelText('Model Chatbot (Tùy chọn)')
    const options = [...document.getElementById(input.getAttribute('list')).querySelectorAll('option')]
    expect(options.map(option => option.value)).toEqual(['gemini-3.8-flash', 'gemini-3.8-pro'])
  })

  it('shows a toast after saving a group', async () => {
    renderSettings({ ok: true })

    fireEvent.click(screen.getAllByRole('button', { name: /Lưu nhóm này/ })[0])

    expect(await screen.findByText('Đã lưu cấu hình!')).toBeInTheDocument()
  })
})
