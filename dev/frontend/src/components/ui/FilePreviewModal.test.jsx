import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import FilePreviewModal from './FilePreviewModal'

const renderAsync = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('docx-preview', () => ({ renderAsync }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const gaFetch = (ket_qua) => {
  global.fetch = vi.fn(() => ket_qua)
}

// .docx phải dựng được ngay trong hộp, không đẩy người dùng đi tải xuống —
// docx-preview đã là phụ thuộc sẵn có, trình xem hợp đồng dùng nó từ trước.
it('dựng nội dung Word ngay trong hộp xem tài liệu', async () => {
  const blob = new Blob(['x'], { type: DOCX_MIME })
  gaFetch(Promise.resolve({ blob: () => Promise.resolve(blob) }))

  render(<FilePreviewModal open fileName="HopDong.docx" mimeType={DOCX_MIME} url="blob:abc" onClose={() => {}} />)

  await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1))
  expect(renderAsync.mock.calls[0][0]).toBe(blob)
  expect(screen.queryByText(/không hỗ trợ xem trực tiếp/i)).not.toBeInTheDocument()
})

it('dùng blob đã tải sẵn để dựng Word, không fetch lại blob URL', async () => {
  const blob = new Blob(['x'], { type: DOCX_MIME })
  global.fetch = vi.fn(() => Promise.reject(new Error('không được đọc lại blob URL')))

  render(
    <FilePreviewModal
      open
      fileName="HopDong.docx"
      mimeType={DOCX_MIME}
      url="blob:abc"
      blob={blob}
      onClose={() => {}}
    />,
  )

  await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1))
  expect(renderAsync.mock.calls[0][0]).toBe(blob)
  expect(global.fetch).not.toHaveBeenCalled()
})

// Tệp Word hỏng thì rơi về thông báo kèm nút tải xuống, tuyệt đối không để lại
// một ô trắng không giải thích gì.
it('Word hỏng thì nói rõ và vẫn cho tải xuống', async () => {
  gaFetch(Promise.reject(new Error('hỏng')))

  render(<FilePreviewModal open fileName="Hong.docx" mimeType={DOCX_MIME} url="blob:abc" onClose={() => {}} />)

  expect(await screen.findByText(/Không dựng được nội dung tệp Word/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Tải xuống/ })).toBeInTheDocument()
})

// .doc đời cũ là định dạng nhị phân, docx-preview không đọc được — không được
// gọi renderAsync rồi để nó ném lỗi phân tích.
it('không thử dựng .doc đời cũ', async () => {
  gaFetch(Promise.resolve({ blob: () => Promise.resolve(new Blob(['x'])) }))

  render(<FilePreviewModal open fileName="BienBan.doc" mimeType="application/msword" url="blob:abc" onClose={() => {}} />)

  expect(await screen.findByText(/không hỗ trợ xem trực tiếp/i)).toBeInTheDocument()
  expect(renderAsync).not.toHaveBeenCalled()
})

it('PDF vẫn dùng iframe sẵn có, không đụng tới docx-preview', async () => {
  render(<FilePreviewModal open fileName="SoDo.pdf" mimeType="application/pdf" url="blob:abc" onClose={() => {}} />)

  expect(await screen.findByTitle(/Xem trước SoDo.pdf/)).toBeInTheDocument()
  expect(renderAsync).not.toHaveBeenCalled()
})
