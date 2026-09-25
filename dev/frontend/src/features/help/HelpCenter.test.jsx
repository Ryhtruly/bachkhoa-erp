import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import HelpCenter, { isSectionVisible } from './HelpCenter'
import { HELP_GROUPS, HELP_SECTIONS } from './helpContent'

afterEach(cleanup)

const toc = () => screen.getByRole('navigation', { name: 'Mục lục hướng dẫn' })

describe('helpContent', () => {
  it('mỗi mục có id duy nhất, thuộc nhóm có thật và có nội dung', () => {
    const ids = HELP_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const section of HELP_SECTIONS) {
      expect(HELP_GROUPS).toContain(section.group)
      expect(section.blocks.length).toBeGreaterThan(0)
    }
  })
})

describe('isSectionVisible', () => {
  const byId = (id) => HELP_SECTIONS.find((section) => section.id === id)

  it('nhân viên không thấy mục chỉ dành cho Giám đốc hay khối quản lý', () => {
    const employee = { workspace: 'employee', permissions: { survey_record: true, wiki: true } }
    expect(isSectionVisible(byId('be-viec'), employee)).toBe(true)
    expect(isSectionVisible(byId('ho-so-do-ve'), employee)).toBe(true)
    expect(isSectionVisible(byId('ho-so-phap-ly'), employee)).toBe(false)
    expect(isSectionVisible(byId('tong-quan'), employee)).toBe(false)
    expect(isSectionVisible(byId('hop-dong'), employee)).toBe(false)
  })

  it('Giám đốc thấy mọi mục', () => {
    const director = { workspace: 'management', permissions: {}, isDirector: true }
    expect(HELP_SECTIONS.every((section) => isSectionVisible(section, director))).toBe(true)
  })
})

describe('HelpCenter', () => {
  it('không kéo người đang đọc về mục của tab khi trang vẽ lại', () => {
    const props = { open: true, onClose: () => {}, activeTab: 'crm', workspace: 'management' }
    const { rerender } = render(<HelpCenter {...props} permissions={{ crm: true }} />)
    fireEvent.click(within(toc()).getByRole('button', { name: 'Câu hỏi thường gặp' }))
    rerender(<HelpCenter {...props} permissions={{ crm: true }} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Câu hỏi thường gặp')
  })

  it('mở ở tab nào thì hiện ngay hướng dẫn của tab đó', () => {
    render(<HelpCenter open onClose={() => {}} activeTab="crm" workspace="management" permissions={{ crm: true }} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('CRM Bán Hàng')
  })

  it('tìm kiếm không dấu lọc mục lục và bấm mục để đọc', () => {
    render(<HelpCenter open onClose={() => {}} activeTab="dashboard" workspace="management" permissions={{}} isDirector />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm trong hướng dẫn' }), { target: { value: 'ban giao' } })

    const item = within(toc()).getByRole('button', { name: 'Bàn giao cho khách & kiểm soát công nợ' })
    expect(within(toc()).queryByRole('button', { name: 'KPI Nhân Sự' })).toBeNull()

    fireEvent.click(item)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Bàn giao cho khách')
    expect(screen.getAllByText(/Khóa nợ/).length).toBeGreaterThan(0)
  })

  it('cho xem thêm chức năng của vai trò khác khi cần', () => {
    render(<HelpCenter open onClose={() => {}} activeTab="employee-dashboard" workspace="employee" permissions={{}} />)
    expect(within(toc()).queryByRole('button', { name: 'Quản Lý Timeline' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /Xem cả chức năng của vai trò khác/ }))
    expect(within(toc()).getByRole('button', { name: 'Quản Lý Timeline' })).toBeInTheDocument()
  })
})
