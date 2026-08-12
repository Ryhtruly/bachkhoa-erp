import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AvatarImage from './AvatarImage'

afterEach(cleanup)

describe('AvatarImage', () => {
  it('uses initials after a valid avatar URL fails to load', () => {
    render(<AvatarImage src="http://minio.test/missing.png" name="Nguyễn Văn An" className="avatar" />)

    fireEvent.error(screen.getByRole('img', { name: 'Nguyễn Văn An' }))

    expect(screen.getByLabelText('Ảnh đại diện dự phòng của Nguyễn Văn An')).toHaveTextContent('NA')
  })

  it('does not render an unsafe avatar URL', () => {
    render(<AvatarImage src="javascript:alert(1)" name="Nguyễn Văn An" className="avatar" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ảnh đại diện dự phòng của Nguyễn Văn An')).toBeInTheDocument()
  })
})
