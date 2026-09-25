import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TopHeader from './TopHeader'

vi.mock('./NotificationBell', () => ({ default: () => null }))
vi.mock('./HeaderUserMenu', () => ({ default: () => null }))

afterEach(cleanup)

describe('TopHeader responsive navigation', () => {
  it('exposes an accessible overlay-sidebar trigger', () => {
    const onSidebarOverlayToggle = vi.fn()

    render(
      <TopHeader
        onLogout={vi.fn()}
        user={{ full_name: 'Nhân viên' }}
        onNotificationNavigate={vi.fn()}
        sidebarOverlayOpen={false}
        onSidebarOverlayToggle={onSidebarOverlayToggle}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Mở thanh điều hướng' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(onSidebarOverlayToggle).toHaveBeenCalledOnce()
  })
})

describe('TopHeader help button', () => {
  it('mở hướng dẫn sử dụng từ nút "?"', async () => {
    render(
      <TopHeader
        onLogout={vi.fn()}
        user={{ full_name: 'Nhân viên' }}
        onNotificationNavigate={vi.fn()}
        activeTab="tasks"
        workspace="employee"
        permissions={{ survey_record: true }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn sử dụng' }))
    expect(await screen.findByRole('navigation', { name: 'Mục lục hướng dẫn' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Hồ Sơ Đo Vẽ'))
  })
})
