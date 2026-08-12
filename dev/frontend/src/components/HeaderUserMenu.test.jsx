import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import HeaderUserMenu from './HeaderUserMenu'

describe('HeaderUserMenu', () => {
  it('uses initials after the avatar request fails', () => {
    render(<HeaderUserMenu user={{ full_name: 'Nguyễn Văn An', avatar_url: 'http://localhost:9000/missing.png' }} open={false} onOpenChange={vi.fn()} onLogout={vi.fn()} />)

    fireEvent.error(screen.getByAltText('Nguyễn Văn An'))

    expect(screen.getByLabelText('Ảnh đại diện dự phòng của Nguyễn Văn An')).toHaveTextContent('NA')
  })
})
