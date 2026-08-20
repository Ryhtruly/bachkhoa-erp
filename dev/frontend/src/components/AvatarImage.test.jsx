import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('loads a persisted avatar object key through the authenticated backend', async () => {
    window.localStorage.setItem('bachkhoa_access_token', 'avatar-token')
    const blob = new Blob(['avatar'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-avatar')

    render(<AvatarImage src="avatars/emp-1/avatar.png" name="Nguyễn Văn An" className="avatar" />)

    await waitFor(() => expect(screen.getByRole('img', { name: 'Nguyễn Văn An' })).toHaveAttribute('src', 'blob:private-avatar'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/employee-portal/file?object_key=avatars%2Femp-1%2Favatar.png',
      expect.objectContaining({ headers: { Authorization: 'Bearer avatar-token' } }),
    )
  })
})
