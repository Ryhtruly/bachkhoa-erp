import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import EmployeeWorkspaceHero from './EmployeeWorkspaceHero'

describe('EmployeeWorkspaceHero', () => {
  it('replaces a failed avatar image with an accessible fallback', () => {
    render(<EmployeeWorkspaceHero employee={{ full_name: 'Nguyễn Văn An', avatar_url: 'http://localhost:9000/missing.png' }} />)

    fireEvent.error(screen.getByAltText('Nguyễn Văn An'))

    expect(screen.getByLabelText('Ảnh đại diện dự phòng của Nguyễn Văn An')).toHaveTextContent('NA')
  })
})
