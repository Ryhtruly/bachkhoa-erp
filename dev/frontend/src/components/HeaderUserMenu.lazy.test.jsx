import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.doUnmock('../features/employee-portal/MyPayroll')
  vi.resetModules()
})

describe('HeaderUserMenu payroll loading', () => {
  it('loads the payroll module only after the user opens the payslip modal', async () => {
    const payrollModuleLoaded = vi.fn()
    vi.doMock('../features/employee-portal/MyPayroll', () => {
      payrollModuleLoaded()
      return { default: () => <div>Lazy payslip content</div> }
    })

    const { default: HeaderUserMenu } = await import('./HeaderUserMenu')

    expect(payrollModuleLoaded).not.toHaveBeenCalled()

    render(
      <HeaderUserMenu
        user={{ username: 'staff', full_name: 'Nhân viên' }}
        open={true}
        onOpenChange={vi.fn()}
        onLogout={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Phiếu lương của tôi' }))

    expect(await screen.findByText('Lazy payslip content')).toBeInTheDocument()
    expect(payrollModuleLoaded).toHaveBeenCalledTimes(1)
  })
})
