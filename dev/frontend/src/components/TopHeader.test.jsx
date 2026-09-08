import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
