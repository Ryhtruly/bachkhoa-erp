import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { apiFetch } from './lib/api'
import { requestNavigationPermission } from './lib/unsavedChangesGuard'

const contractNavigationReceived = vi.hoisted(() => vi.fn())
const cashflowNavigationReceived = vi.hoisted(() => vi.fn())
const employeeTaskNavigationReceived = vi.hoisted(() => vi.fn())
const dashboardRendered = vi.hoisted(() => vi.fn())
const hasRefreshSessionHint = vi.hoisted(() => vi.fn())
const markRefreshSessionActive = vi.hoisted(() => vi.fn())

vi.mock('./lib/api', () => ({
  apiFetch: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => 'test-token'),
  hasRefreshSessionHint,
  logoutSession: vi.fn().mockResolvedValue(undefined),
  markRefreshSessionActive,
  refreshAccessToken: vi.fn().mockResolvedValue('fresh-token'),
  setAccessToken: vi.fn(),
}))
vi.mock('./lib/unsavedChangesGuard', () => ({
  requestNavigationPermission: vi.fn(),
}))
vi.mock('./components/TopHeader', () => ({
  default: ({ sidebarOverlayOpen, onSidebarOverlayToggle, onNotificationNavigate, onLogout }) => (
    <div>
      <button
        type="button"
        aria-label="Mở thanh điều hướng thử nghiệm"
        aria-expanded={sidebarOverlayOpen}
        onClick={() => onSidebarOverlayToggle?.()}
      >
        Menu
      </button>
      <button
        type="button"
        onClick={() => onNotificationNavigate?.({ type: 'cashflow_approval', voucher_id: 'voucher-42' })}
      >
        Open cashflow notification
      </button>
      <button
        type="button"
        onClick={() => onNotificationNavigate?.({ type: 'cashflow_approval', voucher_id: 'voucher-43' })}
      >
        Open second cashflow notification
      </button>
      <button
        type="button"
        onClick={() => onNotificationNavigate?.({ type: 'task_assigned', task_node_id: 'task-42' })}
      >
        Open employee task notification
      </button>
      <button
        type="button"
        onClick={() => onNotificationNavigate?.({
          type: 'checklist_review',
          target_type: 'checklist_review',
          target_id: 'checklist-result-42',
          contract_id: 'contract-42',
          service_line_id: 'line-42',
          node_key: 'node-k01',
          task_node_id: 'task-k01',
        })}
      >
        Open checklist notification
      </button>
      <button type="button" onClick={onLogout}>Test logout</button>
    </div>
  ),
}))
vi.mock('./components/ChatWidget', () => ({ default: () => null }))
vi.mock('./pages/Dashboard', () => ({
  default: () => {
    dashboardRendered()
    return <section>Dashboard protected screen</section>
  },
}))
vi.mock('./pages/Cashflow', async () => {
  const { useEffect } = await import('react')
  function MockCashflow() {
    useEffect(() => {
      const handler = (event) => cashflowNavigationReceived(event.detail)
      window.addEventListener('bachkhoa:open-cashflow-voucher', handler)
      return () => window.removeEventListener('bachkhoa:open-cashflow-voucher', handler)
    }, [])
    return <section>Cashflow protected screen</section>
  }
  return {
    default: MockCashflow,
  }
})
vi.mock('./pages/CRM', () => ({
  default: () => <section>CRM protected screen</section>,
}))
vi.mock('./pages/CustomerDirectory', () => ({
  default: () => <section>Customer protected screen</section>,
}))
vi.mock('./pages/Contracts', async () => {
  const { useEffect } = await import('react')
  function MockContracts() {
    useEffect(() => {
      const handler = (event) => contractNavigationReceived(event.detail)
      window.addEventListener('bachkhoa:navigate-to-node', handler)
      return () => window.removeEventListener('bachkhoa:navigate-to-node', handler)
    }, [])
    return <section>Contract protected screen</section>
  }
  return {
    default: MockContracts,
  }
})
vi.mock('./features/employee-portal/EmployeePortalDashboard', async () => {
  const { useEffect } = await import('react')
  function MockEmployeePortalDashboard() {
    useEffect(() => {
      const handler = (event) => employeeTaskNavigationReceived(event.detail)
      window.addEventListener('bachkhoa:open-employee-task', handler)
      return () => window.removeEventListener('bachkhoa:open-employee-task', handler)
    }, [])
    return <section>Employee dashboard screen</section>
  }
  return {
    default: MockEmployeePortalDashboard,
  }
})
vi.mock('./features/employee-portal/MyPayroll', () => ({
  default: () => <section>Employee payroll screen</section>,
}))
vi.mock('./pages/Login', () => ({
  default: ({ onLogin }) => (
    <button
      type="button"
      onClick={() => onLogin('new-token', {
        username: 'staff',
        full_name: 'Nhân viên mới',
        default_workspace: 'management',
        permissions: { finance: true },
      })}
    >
      Test login
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('App sidebar preference', () => {
  beforeEach(() => {
    contractNavigationReceived.mockReset()
    cashflowNavigationReceived.mockReset()
    employeeTaskNavigationReceived.mockReset()
    dashboardRendered.mockReset()
    requestNavigationPermission.mockReset()
    requestNavigationPermission.mockResolvedValue(true)
    hasRefreshSessionHint.mockReturnValue(true)
    markRefreshSessionActive.mockReset()
    localStorage.clear()
    localStorage.setItem('bachkhoa_access_token', 'test-token')
    localStorage.setItem('bachkhoa_sidebar_collapsed', 'true')
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: {},
    })
  })

  it('does not bootstrap auth requests on the login page without a saved session hint', () => {
    hasRefreshSessionHint.mockReturnValue(false)

    render(<App />)

    expect(screen.getByRole('button', { name: 'Test login' })).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('restores and updates the desktop collapsed preference', async () => {
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelector('.app')).toBeInTheDocument())
    expect(container.querySelector('.app')).toHaveClass('app--sidebar-collapsed')

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' }))

    expect(container.querySelector('.app')).not.toHaveClass('app--sidebar-collapsed')
    expect(localStorage.getItem('bachkhoa_sidebar_collapsed')).toBe('false')
  })

  it('does not rerender the active business screen when toggling the desktop sidebar', async () => {
    apiFetch.mockResolvedValue({
      username: 'admin',
      full_name: 'Giám đốc',
      default_workspace: 'management',
      is_director: true,
      permissions: { finance: true },
    })
    localStorage.setItem('bachkhoa_sidebar_collapsed', 'false')

    render(<App />)

    expect(await screen.findByText('Dashboard protected screen')).toBeInTheDocument()
    dashboardRendered.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }))

    expect(dashboardRendered).not.toHaveBeenCalled()
  })

  it('logs out when session validation returns 401', async () => {
    apiFetch.mockRejectedValue({ status: 401, message: 'expired' })

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Test login' })).toBeInTheDocument()
  })

  it('keeps the session when a transient validation timeout recovers', async () => {
    apiFetch
      .mockRejectedValueOnce({ status: 408, message: 'backend is starting' })
      .mockResolvedValueOnce({
        username: 'staff',
        full_name: 'Nhân viên',
        default_workspace: 'management',
        permissions: { finance: true },
      })

    render(<App />)

    expect(await screen.findByText('Cashflow protected screen', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(apiFetch.mock.calls.slice(0, 2).map(([path]) => path)).toEqual(['/api/auth/me', '/api/auth/me'])
    expect(screen.queryByRole('button', { name: 'Test login' })).not.toBeInTheDocument()
  })

  it('opens the responsive overlay and closes it with Escape', async () => {
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelector('.app')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Mở thanh điều hướng thử nghiệm' }))
    expect(container.querySelector('.app')).toHaveClass('app--sidebar-overlay-open')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.app')).not.toHaveClass('app--sidebar-overlay-open')
  })

  it('mounts only the active authorized tab and removes it after navigation', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, customer: true },
    })

    render(<App />)

    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()
    expect(screen.queryByText('Customer protected screen')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Khách Hàng' }))

    expect(await screen.findByText('Customer protected screen')).toBeInTheDocument()
    expect(screen.queryByText('CRM protected screen')).not.toBeInTheDocument()
  })

  it('delivers timeline navigation after the lazy contract screen mounts', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, contract: true },
    })
    const detail = { contractId: 'contract-42', nodeKey: 'survey' }

    render(<App />)
    expect(await screen.findByText('Contract protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()
    window.dispatchEvent(new CustomEvent('bachkhoa:timeline-open-node', { detail }))

    expect(await screen.findByText('Contract protected screen')).toBeInTheDocument()
    await waitFor(() => expect(contractNavigationReceived).toHaveBeenCalledWith(detail))
  })

  it('does not run the leave guard when clicking the effective active tab', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, customer: true },
    })

    render(<App />)
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))

    expect(requestNavigationPermission).not.toHaveBeenCalled()
  })

  it('delivers a cashflow notification after the lazy cashflow screen remounts', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, finance: true },
    })

    render(<App />)
    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open cashflow notification' }))

    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    await waitFor(() => expect(cashflowNavigationReceived).toHaveBeenCalledWith(
      expect.objectContaining({ voucherId: 'voucher-42' }),
    ))
  })

  it('delivers an employee notification after the lazy workspace remounts', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'employee',
      permissions: {},
    })

    render(<App />)
    expect(await screen.findByText('Employee dashboard screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lương' }))
    expect(await screen.findByText('Employee payroll screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open employee task notification' }))

    expect(await screen.findByText('Employee dashboard screen')).toBeInTheDocument()
    await waitFor(() => expect(employeeTaskNavigationReceived).toHaveBeenCalledWith(
      expect.objectContaining({ taskNodeId: 'task-42' }),
    ))
  })

  it('delivers every exact checklist review target to the contract screen', async () => {
    apiFetch.mockResolvedValue({
      username: 'director',
      full_name: 'Giám đốc',
      default_workspace: 'management',
      is_director: true,
      permissions: { contract: true },
    })

    render(<App />)
    expect(await screen.findByText('Contract protected screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open checklist notification' }))

    await waitFor(() => expect(contractNavigationReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'contract-42',
        serviceLineId: 'line-42',
        nodeKey: 'node-k01',
        taskNodeId: 'task-k01',
        targetType: 'checklist_review',
        targetId: 'checklist-result-42',
      }),
    ))
  })

  it('delivers consecutive cashflow notifications in order after lazy mount', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, finance: true },
    })

    render(<App />)
    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open cashflow notification' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open second cashflow notification' }))

    await waitFor(() => expect(cashflowNavigationReceived).toHaveBeenCalledTimes(2))
    expect(cashflowNavigationReceived.mock.calls.map(([detail]) => detail.voucherId)).toEqual([
      'voucher-42',
      'voucher-43',
    ])
  })

  it('does not deliver a pending notification into the next login session', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, finance: true },
    })

    render(<App />)
    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open cashflow notification' }))
    fireEvent.click(screen.getByRole('button', { name: 'Test logout' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Test login' }))

    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(cashflowNavigationReceived).not.toHaveBeenCalled()
  })

  it('lets manual navigation replace a pending automatic navigation', async () => {
    apiFetch.mockResolvedValue({
      username: 'staff',
      full_name: 'Nhân viên',
      default_workspace: 'management',
      permissions: { crm: true, customer: true, finance: true },
    })

    render(<App />)
    expect(await screen.findByText('Cashflow protected screen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CRM Bán Hàng' }))
    expect(await screen.findByText('CRM protected screen')).toBeInTheDocument()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Open cashflow notification' }))
    await act(async () => Promise.resolve())
    expect(screen.getByText('Cashflow protected screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Khách Hàng' }))
    await act(async () => Promise.resolve())
    expect(screen.getByText('Customer protected screen')).toBeInTheDocument()
    act(() => vi.runOnlyPendingTimers())

    fireEvent.click(screen.getByRole('button', { name: 'Open second cashflow notification' }))
    await act(async () => Promise.resolve())
    expect(screen.getByText('Cashflow protected screen')).toBeInTheDocument()
    act(() => vi.runOnlyPendingTimers())

    expect(cashflowNavigationReceived).toHaveBeenCalledTimes(1)
    expect(cashflowNavigationReceived).toHaveBeenCalledWith(
      expect.objectContaining({ voucherId: 'voucher-43' }),
    )
  })
})
