import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { ToastProvider } from '../contexts/ToastContext'

function jsonResponse(body) {
  return Promise.resolve({ json: () => Promise.resolve(body) })
}

function renderSettings(testResult) {
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    if (String(url).endsWith('/settings/test')) return jsonResponse(testResult)
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

  it('shows a toast after saving a group', async () => {
    renderSettings({ ok: true })

    fireEvent.click(screen.getAllByRole('button', { name: /Lưu nhóm này/ })[0])

    expect(await screen.findByText('Đã lưu cấu hình!')).toBeInTheDocument()
  })
})
