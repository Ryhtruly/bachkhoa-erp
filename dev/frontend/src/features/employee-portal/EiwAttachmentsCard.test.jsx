import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import EiwAttachmentsCard from './EiwAttachmentsCard'

describe('EiwAttachmentsCard', () => {
  it('renders inherited files and delegates file and cabinet actions', () => {
    const onOpenFile = vi.fn()
    const onOpenCabinet = vi.fn()
    const file = { file_name: 'HoSo_PhapLy_Goc.pdf', file_size: '2.4 MB', url: 'private/key' }
    render(
      <EiwAttachmentsCard
        files={[file]}
        onOpenFile={onOpenFile}
        onOpenCabinet={onOpenCabinet}
        onUploadOutput={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Tủ hồ sơ đính kèm' })).toBeInTheDocument()
    expect(screen.getByText('HoSo_PhapLy_Goc.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem HoSo_PhapLy_Goc.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: /Mở tủ hồ sơ theo bước/ }))
    expect(onOpenFile).toHaveBeenCalledWith(file)
    expect(onOpenCabinet).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit empty state and keeps upload wired to output checklist', () => {
    const onUploadOutput = vi.fn()
    const { container } = render(<EiwAttachmentsCard onUploadOutput={onUploadOutput} />)
    const card = container.querySelector('[aria-label="Tủ hồ sơ đính kèm"]')
    expect(screen.getByText('Chưa có tài liệu kế thừa cho bước này.')).toBeInTheDocument()
    fireEvent.click(card.querySelector('.eiw-link'))
    expect(onUploadOutput).toHaveBeenCalledTimes(1)
  })
})
