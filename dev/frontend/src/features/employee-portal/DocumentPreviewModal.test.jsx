import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('docx-preview', () => ({ renderAsync: vi.fn(() => Promise.resolve()) }))

import { renderAsync } from 'docx-preview'
import DocumentPreviewModal from './DocumentPreviewModal'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DocumentPreviewModal — trình xem chỉ đọc, trung thực', () => {
  it('PDF: dựng iframe với src đúng bằng url được truyền vào', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.pdf"
        mimeType="application/pdf"
        url="blob:real-pdf"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTitle('ban-ve.pdf')).toHaveAttribute('src', 'blob:real-pdf')
  })

  it('Ảnh: dựng img với src đúng bằng url được truyền vào', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="anh-thuc-dia.jpg"
        mimeType="image/jpeg"
        url="blob:real-img"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByAltText('anh-thuc-dia.jpg')).toHaveAttribute('src', 'blob:real-img')
  })

  it('DOCX có blob: dùng docx-preview renderAsync, không bịa nội dung', async () => {
    const blob = new Blob(['docx-bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    render(
      <DocumentPreviewModal
        open
        fileName="bao-cao.docx"
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        url="blob:real-docx"
        blob={blob}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1))
    expect(renderAsync.mock.calls[0][0]).toBe(blob)
  })

  it('DOC (.doc) KHÔNG phải DOCX: không đẩy sang docx-preview; báo không xem được + hành động mở đúng url', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="bao-cao-cu.doc"
        mimeType=""
        url="blob:real-doc"
        onClose={vi.fn()}
      />,
    )
    // .doc không được coi là docx nên không được gửi tới docx-preview
    expect(renderAsync).not.toHaveBeenCalled()
    // Hiện trạng thái không hỗ trợ xem trước trên trình duyệt
    expect(screen.getByText(/không thể xem trước|không hỗ trợ xem trước/i)).toBeInTheDocument()
    // Giữ hành động mở/tải tệp với đúng url thật
    const openLink = screen.getByRole('link', { name: /Mở tệp trong tab mới/i })
    expect(openLink).toHaveAttribute('href', 'blob:real-doc')
  })

  it('Định dạng không hỗ trợ (DWG) với url thật: báo không xem được + giữ hành động mở/tải đúng url', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.dwg"
        mimeType="application/acad"
        url="blob:real-dwg"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/không thể xem trước|không hỗ trợ xem trước/i)).toBeInTheDocument()
    // Không bịa bản vẽ địa chính
    expect(screen.queryByText(/BẢN TRÍCH ĐO ĐỊA CHÍNH/i)).not.toBeInTheDocument()
    const openLink = screen.getByRole('link', { name: /Mở tệp trong tab mới/i })
    expect(openLink).toHaveAttribute('href', 'blob:real-dwg')
  })

  it('Không có url/blob: hiện trạng thái rỗng trung thực, không có ảnh/bản vẽ/metadata bịa', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.dwg"
        mimeType=""
        url=""
        blob={null}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Chưa có tệp để xem trước.')).toBeInTheDocument()
    expect(screen.queryByAltText('Ảnh chụp thực địa')).not.toBeInTheDocument()
    expect(screen.queryByText(/BẢN TRÍCH ĐO ĐỊA CHÍNH/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/VN-2000/)).not.toBeInTheDocument()
  })

  it('An toàn: KHÔNG dùng doc.url làm nguồn xem trước/tải về; hiện trạng thái rỗng khi thiếu url xác thực', () => {
    const { container } = render(
      <DocumentPreviewModal
        open
        fileName="ho-so-phap-ly.pdf"
        doc={{ url: 'private-object-url' }}
        onClose={vi.fn()}
      />,
    )
    // Không có url xác thực và không có blob → trạng thái rỗng trung thực
    expect(screen.getByText('Chưa có tệp để xem trước.')).toBeInTheDocument()
    // Không có link tải về / mở tệp trỏ tới doc.url riêng tư
    expect(screen.queryByRole('link', { name: /Tải về/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Mở tệp trong tab mới/i })).not.toBeInTheDocument()
    // Không phần tử nào (link/iframe/img) dùng doc.url làm href/src
    container.querySelectorAll('a[href], iframe[src], img[src]').forEach((el) => {
      expect(el.getAttribute('href')).not.toBe('private-object-url')
      expect(el.getAttribute('src')).not.toBe('private-object-url')
    })
  })

  it('không còn bất kỳ tuyên bố SHA-256 hay chữ ký số bịa nào', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.pdf"
        mimeType="application/pdf"
        url="blob:real-pdf"
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Đã chứng thực SHA-256/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Đã ký số điện tử SHA-256/i)).not.toBeInTheDocument()
  })

  it('không còn tab Tải lên / Thay thế, preset, biểu mẫu tải lên hay ô tự khắc phục', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.pdf"
        mimeType="application/pdf"
        url="blob:real-pdf"
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Tải lên|Thay thế/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/file mẫu thử nghiệm/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('Tải về: dùng đúng url thật khi có tệp', () => {
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.pdf"
        mimeType="application/pdf"
        url="blob:real-pdf"
        onClose={vi.fn()}
      />,
    )
    const download = screen.getByRole('link', { name: /Tải về/i })
    expect(download).toHaveAttribute('href', 'blob:real-pdf')
  })

  it('Tải về: khi không có url thì không bịa tải xuống (không có link tải, không alert)', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.dwg"
        mimeType=""
        url=""
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: /Tải về/i })).not.toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('giữ vai trò dialog và đóng bằng nút Đóng / phím Escape', () => {
    const onClose = vi.fn()
    render(
      <DocumentPreviewModal
        open
        fileName="ban-ve.pdf"
        mimeType="application/pdf"
        url="blob:real-pdf"
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('không hiển thị gì khi open=false', () => {
    const { container } = render(
      <DocumentPreviewModal
        open={false}
        fileName="ban-ve.pdf"
        url="blob:real-pdf"
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
