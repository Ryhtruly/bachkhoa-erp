import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../NotificationBell', () => ({ default: () => null }))
vi.mock('../HeaderUserMenu', () => ({ default: () => null }))

import TopHeader from '../TopHeader'
import FinanceNav from './FinanceNav'

afterEach(cleanup)

describe('Finance mobile layout hooks', () => {
  it('keeps header actions in a responsive layout boundary', () => {
    render(
      <TopHeader
        onLogout={vi.fn()}
        user={{ full_name: 'Nhân viên' }}
        onNotificationNavigate={vi.fn()}
      />,
    )

    expect(screen.getByRole('banner')).toHaveClass('top-header')
    expect(screen.getByRole('banner').querySelector('.header-actions')).toHaveClass('top-header__actions')
  })

  it('exposes named horizontal scroll boundaries for finance navigation', () => {
    render(
      <FinanceNav
        activeTab="monthly-dashboard"
        onSelectTab={vi.fn()}
        isDirector={false}
      />,
    )

    expect(screen.getByRole('region', { name: 'Nhóm phân hệ tài chính' })).toHaveClass('finance-grouped-nav__groups')
    expect(screen.getByRole('region', { name: 'Các màn hình tài chính' })).toHaveClass('finance-grouped-nav__tabs')
  })
})
