import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import EiwTaskDescription from './EiwTaskDescription'

afterEach(cleanup)

describe('EiwTaskDescription', () => {
  it('renders description text', () => {
    render(<EiwTaskDescription description="Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh." />)
    expect(screen.getByText('Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh.')).toBeInTheDocument()
  })

  it('applies eiw-desc class', () => {
    render(<EiwTaskDescription description="abc" />)
    expect(screen.getByRole('region', { name: 'Mô tả nhiệm vụ' })).toHaveClass('eiw-desc')
  })

  it('shows default empty message when description is empty', () => {
    render(<EiwTaskDescription description="" />)
    expect(screen.getByText('Bước này chưa có mô tả công việc.')).toBeInTheDocument()
  })

  it('shows default empty message when description is null', () => {
    render(<EiwTaskDescription description={null} />)
    expect(screen.getByText('Bước này chưa có mô tả công việc.')).toBeInTheDocument()
  })

  it('uses custom empty message', () => {
    render(<EiwTaskDescription description={null} emptyMessage="Chưa có mô tả." />)
    expect(screen.getByText('Chưa có mô tả.')).toBeInTheDocument()
  })

  it('renders long Vietnamese text without truncation', () => {
    const longText = 'Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh. Kiểm tra hiện trạng công trình, xác minh ranh giới pháp lý, lập bản vẽ hiện trạng và phối hợp với chủ đầu tư để hoàn thiện hồ sơ kỹ thuật.'
    render(<EiwTaskDescription description={longText} />)
    expect(screen.getByText(longText)).toBeInTheDocument()
  })
})
