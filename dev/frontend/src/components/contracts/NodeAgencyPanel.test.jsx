import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeAgencyPanel from './NodeAgencyPanel'
import { daysUntil, latestSubmission, pauseNote } from './nodeAgency'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: () => 'jwt' }))
vi.mock('../../features/legal-dossier/LegalDossierActions', () => ({
  default: () => <div data-testid="legal-actions" />,
}))

const { apiFetch } = await import('../../lib/api')

const DOSSIER = {
  id: 'ds-1',
  status: 'PROCESSING',
  status_label: 'Đang xử lý',
  sub_status: null,
  submission_count: 1,
  latest_receipt_code: 'BN-2026/0001',
  submissions: [
    { id: 's1', submit_seq: 1, receipt_code: 'BN-2026/0001', received_date: '2026-09-01', expected_return_date: '2026-09-20' },
  ],
  events: [],
}

const mount = (dossier, nodeCode = 'K05a') => {
  apiFetch.mockReset()
  apiFetch.mockImplementation((url) => {
    if (dossier === null) return Promise.reject(new Error('404'))
    if (url.includes('by-task-node')) return Promise.resolve({ data: { id: dossier.id } })
    return Promise.resolve({ data: dossier })
  })
  return render(
    <NodeAgencyPanel taskNodeId="task-1" nodeCode={nodeCode} addToast={vi.fn()} />,
  )
}

describe('Đếm ngày tới hạn', () => {
  const moc = new Date('2026-09-10T08:00:00Z')

  it('còn hạn thì dương, quá hạn thì âm, đúng hôm nay thì 0', () => {
    expect(daysUntil('2026-09-20', moc)).toBe(10)
    expect(daysUntil('2026-09-01', moc)).toBe(-9)
    expect(daysUntil('2026-09-10', moc)).toBe(0)
  })

  it('chưa có ngày hẹn thì trả null chứ không đoán bừa', () => {
    expect(daysUntil(null, moc)).toBeNull()
    expect(daysUntil('khong-phai-ngay', moc)).toBeNull()
  })
})

describe('Lấy đúng lần nộp gần nhất', () => {
  it('nhiều lần nộp thì lấy lần CUỐI — mã và ngày hẹn của lần đầu đã hết hiệu lực', () => {
    const d = {
      submissions: [
        { submit_seq: 1, receipt_code: 'BN-CU' },
        { submit_seq: 2, receipt_code: 'BN-MOI' },
      ],
    }
    expect(latestSubmission(d).receipt_code).toBe('BN-MOI')
  })

  it('chưa nộp lần nào thì null', () => {
    expect(latestSubmission({ submissions: [] })).toBeNull()
    expect(latestSubmission({})).toBeNull()
  })
})

describe('Ghi chú của lần tạm dừng đang có hiệu lực', () => {
  it('lấy mốc PENDING gần nhất, không lấy mốc cũ', () => {
    const d = {
      status: 'PENDING',
      events: [
        { to_status: 'PENDING', note: 'lý do cũ' },
        { to_status: 'PROCESSING', note: 'chạy tiếp' },
        { to_status: 'PENDING', note: 'Sai ranh mốc chờ đo vẽ sửa' },
      ],
    }
    expect(pauseNote(d)).toBe('Sai ranh mốc chờ đo vẽ sửa')
  })

  it('không ở trạng thái tạm dừng thì không lôi ghi chú cũ ra', () => {
    expect(pauseNote({ status: 'PROCESSING', events: [{ to_status: 'PENDING', note: 'cũ' }] })).toBeNull()
  })
})

describe('Khối nộp cơ quan — lúc đang thiết kế', () => {
  afterEach(cleanup)

  it('bước chưa chạy thì xem trước, không để trống', () => {
    render(<NodeAgencyPanel taskNodeId={null} nodeCode="K05a" addToast={vi.fn()} />)

    expect(screen.getByText('Nộp & lấy biên nhận')).toBeInTheDocument()
    expect(screen.getByText(/tạm dừng \/ tiếp tục/)).toBeInTheDocument()
  })

  it('K05b lúc xem trước nói đúng thứ của nó: nhật ký cơ quan', () => {
    render(<NodeAgencyPanel taskNodeId={null} nodeCode="K05b" addToast={vi.fn()} />)

    expect(screen.getByText('Theo dõi & rút kết quả')).toBeInTheDocument()
    expect(screen.getByText(/nhật ký tiến độ cơ quan/)).toBeInTheDocument()
  })
})

describe('Khối nộp cơ quan — màn Giám đốc', () => {
  afterEach(cleanup)

  it('không có hồ sơ thì KHÔNG hiện gì, không để lại khung rỗng', async () => {
    const { container } = mount(null)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container.querySelector('.wf-agency')).not.toBeInTheDocument()
  })

  it('K05a đang tạm dừng thì hiện ngay dải lý do kèm ghi chú', async () => {
    mount({
      ...DOSSIER,
      status: 'PENDING',
      status_label: 'Tạm dừng',
      sub_status: 'SURVEYOR',
      events: [{ id: 'e1', to_status: 'PENDING', note: 'Sai ranh mốc chờ đo vẽ sửa' }],
    })

    const dai = await screen.findByRole('status')
    expect(dai).toHaveTextContent('ĐANG TẠM DỪNG')
    expect(dai).toHaveTextContent('Sai ranh mốc chờ đo vẽ sửa')
    expect(dai).toHaveTextContent('ĐO VẼ')
  })

  it('K05a đang tạm dừng thì nói rõ vì sao chưa nộp nghiệm thu được', async () => {
    mount({ ...DOSSIER, status: 'PENDING', status_label: 'Tạm dừng', sub_status: 'AGENCY' })
    expect(await screen.findByText(/chưa nộp nghiệm thu được/)).toBeInTheDocument()
  })

  it('K05a KHÔNG có nhật ký tiến độ cơ quan — nộp xong là hết việc với cơ quan', async () => {
    mount({ ...DOSSIER, events: [{ id: 'e1', to_status: 'PROCESSING', note: 'nhận việc' }] })
    await screen.findByText('BN-2026/0001')
    expect(screen.queryByText(/Nhật ký tiến độ cơ quan/)).not.toBeInTheDocument()
  })

  it('K05b ghi rõ mã biên nhận là kế thừa, không phải tự sinh', async () => {
    mount(DOSSIER, 'K05b')
    expect(await screen.findByText('kế thừa từ K05a')).toBeInTheDocument()
  })

  it('K05b có nhật ký tiến độ và chặn đóng bước khi chưa có kết quả', async () => {
    mount({
      ...DOSSIER,
      events: [
        { id: 'e1', to_status: 'PROCESSING', note: 'nhận việc' },
        { id: 'e2', to_status: 'PENDING', sub_status: 'AGENCY', note: 'chờ thông báo thuế' },
      ],
    }, 'K05b')

    expect(await screen.findByText(/Nhật ký tiến độ cơ quan/)).toBeInTheDocument()
    expect(screen.getByText(/chưa đóng được bước này/)).toBeInTheDocument()
  })

  it('mã và ngày hẹn lấy từ lần nộp CUỐI, không phải lần đầu', async () => {
    mount({
      ...DOSSIER,
      submission_count: 2,
      submissions: [
        { id: 's1', submit_seq: 1, receipt_code: 'BN-CU', expected_return_date: '2026-01-01' },
        { id: 's2', submit_seq: 2, receipt_code: 'BN-MOI', expected_return_date: '2026-12-31' },
      ],
    })

    expect(await screen.findByText('BN-MOI')).toBeInTheDocument()
    expect(screen.queryByText('BN-CU')).not.toBeInTheDocument()
    expect(screen.getByText(/đã nộp 2 lần/)).toBeInTheDocument()
  })

  it('quá ngày hẹn trả thì cảnh báo, không im lặng', async () => {
    mount({
      ...DOSSIER,
      submissions: [{ id: 's1', submit_seq: 1, receipt_code: 'BN-X', expected_return_date: '2000-01-01' }],
    })

    const hang = (await screen.findByText('Ngày hẹn trả')).closest('.wf-agency__row')
    expect(within(hang).getByText(/quá hạn/)).toBeInTheDocument()
    expect(screen.getByText(/Quá ngày hẹn trả/)).toBeInTheDocument()
  })

  it('chưa có biên nhận thì nói "chưa có", không bỏ trống hàng', async () => {
    mount({ ...DOSSIER, latest_receipt_code: null, submissions: [] })
    const hang = (await screen.findByText('Mã biên nhận')).closest('.wf-agency__row')
    expect(within(hang).getByText('chưa có')).toBeInTheDocument()
  })
})
