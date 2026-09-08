import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ChecklistCabinetTree from './ChecklistCabinetTree'

const groups = [{
  node_code: 'K01',
  node_name: 'Tiếp nhận & kiểm tra đầu vào',
  task_node_id: 'TN-1',
  total: 2,
  done: 1,
  documents: [{
    id: 'DT-1', name: 'CCCD/CMND của người sử dụng đất', source_label: 'Khách hàng cung cấp',
    file_count: 1, files: [{ id: 'D-1', document_id: 'D-1', file_name: 'mat-truoc.jpg' }],
  }, {
    id: 'DT-2', name: 'Giấy xác nhận thông tin cư trú', source_label: 'Khách hàng cung cấp',
    file_count: 0, files: [],
  }],
}]

afterEach(cleanup)

describe('ChecklistCabinetTree', () => {
  it('hiện Node → loại giấy → file đạt, không bày tầng checklist', () => {
    const onOpenFile = vi.fn()
    render(<ChecklistCabinetTree groups={groups} onOpenFile={onOpenFile} />)

    fireEvent.click(screen.getByRole('button', { name: /K01.*1\/2/i }))
    expect(screen.getByText('CCCD/CMND của người sử dụng đất')).toBeInTheDocument()
    expect(screen.getByText('Giấy xác nhận thông tin cư trú')).toBeInTheDocument()
    expect(screen.queryByText('Tiếp nhận hồ sơ & giấy tờ từ khách')).not.toBeInTheDocument()

    const typeButton = screen.getByRole('button', { name: /CCCD\/CMND.*1 file/i })
    fireEvent.click(typeButton)
    const fileButton = screen.getByRole('button', { name: 'mat-truoc.jpg' })
    fireEvent.click(fileButton)
    expect(onOpenFile).toHaveBeenCalledWith(groups[0].documents[0].files[0])
  })

  it('loại giấy 0 file vẫn hiện gọn và không tạo khoảng rỗng', () => {
    render(<ChecklistCabinetTree groups={groups} />)
    fireEvent.click(screen.getByRole('button', { name: /K01.*1\/2/i }))

    const row = screen.getByRole('button', { name: /Giấy xác nhận.*0 file/i }).closest('li')
    expect(within(row).getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/chưa có tệp cho loại giấy này/i)).not.toBeInTheDocument()
  })

  it('hỗ trợ tìm kiếm lọc nhanh loại giấy và file đạt', () => {
    render(<ChecklistCabinetTree groups={groups} />)
    const searchInput = screen.getByRole('searchbox', { name: /Tìm kiếm trong tủ hồ sơ/i })
    fireEvent.change(searchInput, { target: { value: 'CCCD' } })

    expect(screen.getByText('CCCD/CMND của người sử dụng đất')).toBeInTheDocument()
    expect(screen.queryByText('Giấy xác nhận thông tin cư trú')).not.toBeInTheDocument()
  })

  it('hỗ trợ mở tất cả và thu gọn tất cả', () => {
    render(<ChecklistCabinetTree groups={groups} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả' }))
    expect(screen.getByText('CCCD/CMND của người sử dụng đất')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'mat-truoc.jpg' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }))
    expect(screen.queryByText('CCCD/CMND của người sử dụng đất')).not.toBeInTheDocument()
  })
})

