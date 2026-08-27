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

  it('extracts avatars/... from legacy full MinIO URL and uses authenticated backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:legacy-avatar')

    render(<AvatarImage src="http://localhost:9000/bachkhoa-erp-local/avatars/emp-1/old.png" name="Văn An" />)

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:legacy-avatar'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/employee-portal/file?object_key=avatars%2Femp-1%2Fold.png',
      expect.anything()
    )
    
    // Proves we didn't try to load localhost:9000 as a direct image src first
    const img = screen.getByRole('img')
    expect(img.src).not.toContain('localhost:9000')
  })

  it('keeps normal public URLs direct', () => {
    render(<AvatarImage src="https://ui-avatars.com/api/?name=An" name="An" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://ui-avatars.com/api/?name=An')
  })

  it('keeps normal public CDN URLs starting with /avatars/... direct without fetching', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<AvatarImage src="https://cdn.example.test/avatars/e-1.png" name="An" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://cdn.example.test/avatars/e-1.png')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalid private URL falls back without direct MinIO retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    
    render(<AvatarImage src="http://localhost:9000/bucket/avatars/missing.png" name="Văn An" />)
    
    await waitFor(() => expect(screen.getByLabelText(/dự phòng/)).toBeInTheDocument())
    
    // Proves we didn't mount an img tag with the MinIO URL
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('revokes replaced object URLs when src changes', async () => {
    const revokeMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const createMock = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<AvatarImage src="avatars/emp-1.png" name="An" />)
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:first'))

    rerender(<AvatarImage src="avatars/emp-2.png" name="An" />)
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:second'))

    expect(revokeMock).toHaveBeenCalledWith('blob:first')
  })
})
