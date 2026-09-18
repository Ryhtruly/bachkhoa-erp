import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Sidebar from './Sidebar'

afterEach(cleanup)

const permissions = {
  finance: true,
  crm: true,
  customer: true,
  survey_record: true,
  legal_submission: true,
  contract: true,
  hr: true,
}

function renderSidebar(overrides = {}) {
  const props = {
    activeTab: 'cashflow',
    setActiveTab: vi.fn(),
    mode: 'management',
    permissions,
    isDirector: true,
    collapsed: false,
    overlayOpen: false,
    onToggleCollapsed: vi.fn(),
    onRequestClose: vi.fn(),
    ...overrides,
  }

  return { ...render(<Sidebar {...props} />), props }
}

describe('Sidebar responsive navigation', () => {
  it('keeps icon-only navigation understandable and keyboard accessible when collapsed', () => {
    const { container, props } = renderSidebar({ collapsed: true })

    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--collapsed')
    expect(screen.getByRole('button', { name: 'Thu Chi Sổ Quỹ' })).toHaveAttribute('title', 'Thu Chi Sổ Quỹ')

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' }))
    expect(props.onToggleCollapsed).toHaveBeenCalledOnce()
  })

  it('closes an overlay sidebar after choosing a destination', () => {
    const { props } = renderSidebar({ overlayOpen: true })

    fireEvent.click(screen.getByRole('button', { name: 'Hợp Đồng' }))

    expect(props.setActiveTab).toHaveBeenCalledWith('contracts')
    expect(props.onRequestClose).toHaveBeenCalledOnce()
  })

  it('provides a backdrop that closes the overlay without navigating', () => {
    const { props } = renderSidebar({ overlayOpen: true })

    fireEvent.click(screen.getByRole('button', { name: 'Đóng thanh điều hướng' }))

    expect(props.onRequestClose).toHaveBeenCalledOnce()
    expect(props.setActiveTab).not.toHaveBeenCalled()
  })

  it('renders Đào Tạo & ISO tab for accountants in management mode without showing Nhân Sự', () => {
    renderSidebar({ roleName: 'accountant', isDirector: false, permissions: { wiki: true, finance: true } })

    expect(screen.getByRole('button', { name: 'Đào Tạo & ISO' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nhân Sự & Đào Tạo' })).not.toBeInTheDocument()
  })

  it('renders Nhân Sự & Đào Tạo tab for HR roles in management mode', () => {
    renderSidebar({ roleName: 'hr_manager', isDirector: false, permissions: { hr: true } })

    expect(screen.getByRole('button', { name: 'Nhân Sự & Đào Tạo' })).toBeInTheDocument()
  })

  it('hides the tab when neither HR nor wiki permission is present', () => {
    renderSidebar({ roleName: 'accountant', isDirector: false, permissions: { finance: true } })

    expect(screen.queryByRole('button', { name: 'Nhân Sự & Đào Tạo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đào Tạo & ISO' })).not.toBeInTheDocument()
  })

  it('renders Đào Tạo & ISO in employee mode when wiki permission is present', () => {
    renderSidebar({ mode: 'employee', permissions: { wiki: true } })

    expect(screen.getByRole('button', { name: 'Đào Tạo & ISO' })).toBeInTheDocument()
  })
})
