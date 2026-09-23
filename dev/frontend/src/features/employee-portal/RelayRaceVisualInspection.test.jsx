import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmployeeWorkspace from './EmployeeWorkspace'
import EmployeeItemWorkspace from './EmployeeItemWorkspace'
import NodeChain from './NodeChain'
import { ToastProvider } from '../../contexts/ToastContext'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ blockers: [] }),
  getAccessToken: () => null,
  peekApiCache: vi.fn(() => null),
}))

vi.mock('./EmployeeWorkspaceCalendar', () => ({
  default: () => <div data-testid="mock-calendar" />,
  ChecklistEvidenceItem: () => <div data-testid="minh-chung" />,
  NodeActionBar: ({ task }) => (
    <div data-testid="node-primary-action">
      <button type="button">Hành động {task?.status}</button>
    </div>
  ),
}))

// Mẫu chuỗi 7 node kinh điển:
// N01, N02: Đo vẽ (Anh A)
// N03, N04, N05: Pháp lý (Anh B)
// N06, N07: Đo vẽ (Anh A)
const relayRace7Nodes = [
  {
    id: 'node-01',
    node_code: 'N01',
    name: 'Khảo sát hiện trường',
    status: 'ready',
    pool_department_code: 'SURVEY',
    department_name: 'Phòng Đo vẽ',
    mine: true,
  },
  {
    id: 'node-02',
    node_code: 'N02',
    name: 'Đo vẽ địa chính',
    status: 'pending',
    pool_department_code: 'SURVEY',
    department_name: 'Phòng Đo vẽ',
    mine: true,
  },
  {
    id: 'node-03',
    node_code: 'N03',
    name: 'Soạn thảo hồ sơ pháp lý',
    status: 'pending',
    pool_department_code: 'LEGAL',
    department_name: 'Phòng Pháp lý',
    mine: false,
  },
  {
    id: 'node-04',
    node_code: 'N04',
    name: 'Thẩm tra pháp lý',
    status: 'pending',
    pool_department_code: 'LEGAL',
    department_name: 'Phòng Pháp lý',
    mine: false,
  },
  {
    id: 'node-05',
    node_code: 'N05',
    name: 'Nộp một cửa thụ lý',
    status: 'pending',
    pool_department_code: 'LEGAL',
    department_name: 'Phòng Pháp lý',
    mine: false,
  },
  {
    id: 'node-06',
    node_code: 'N06',
    name: 'Cập nhật biến động bản đồ',
    status: 'pending',
    pool_department_code: 'SURVEY',
    department_name: 'Phòng Đo vẽ',
    mine: true,
  },
  {
    id: 'node-07',
    node_code: 'N07',
    name: 'Nghiệm thu hoàn tất bản vẽ',
    status: 'pending',
    pool_department_code: 'SURVEY',
    department_name: 'Phòng Đo vẽ',
    mine: true,
  },
]

describe('Agentic UI Inspection & Visual Scan: Luồng Bể Công Việc 7 Node (Cơ chế Chuyền gậy)', () => {
  // =========================================================================
  // VAI TRÒ 1: ĐO VẼ (Anh A - Surveyor)
  // =========================================================================
  describe('Vai trò Đo vẽ (Anh A)', () => {
    const employeeSurvey = {
      id: 'emp-surveyor-a',
      full_name: 'Nguyễn Văn A',
      department: 'Đo vẽ',
      department_code: 'SURVEY',
      department_name: 'Phòng Đo vẽ',
    }

    const taskPoolForSurvey = {
      department: 'Đo vẽ',
      department_code: 'SURVEY',
      department_name: 'Phòng Đo vẽ',
      items: [
        {
          id: 'pool-survey-item-1',
          contract_id: 'HĐ 11/BK-2026',
          service_line_id: 'sl-01',
          service_line_name: 'Hồ sơ kỹ thuật thửa đất',
          customer_name: 'Nguyễn Văn Khách',
          node_code: 'N01',
          node_name: 'Khảo sát hiện trường',
          chain_nodes: relayRace7Nodes.map(n => ({
            ...n,
            is_my_department: n.pool_department_code === 'SURVEY',
          })),
          chain_codes: ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07'],
          step_count: 7,
          groups: ['CHAIN'],
          can_claim: true,
          chain_amount: 3_500_000,
        },
      ],
      restrictions: { wip_limit: 3, held_items: 0, active_in_progress: 0 },
    }

    it('1.1. Visual Scan Bể việc Đo vẽ: Thấy đủ 7 node; N03-N05 gắn tag [Pháp lý], class is-prohibited và icon Ban', () => {
      const { container } = render(
        <ToastProvider>
          <EmployeeWorkspace
            employee={employeeSurvey}
            taskPool={taskPoolForSurvey}
            heldItems={[]}
          />
        </ToastProvider>,
      )

      // Kiểm tra tất cả mã node đều hiện
      relayRace7Nodes.forEach(node => {
        expect(screen.getByText(node.node_code)).toBeInTheDocument()
      })

      // Soi thị giác các node bị cấm (Pháp lý: N03, N04, N05)
      const prohibitedItems = container.querySelectorAll('.ew-card__chain-item.is-prohibited')
      expect(prohibitedItems).toHaveLength(3)

      // Kiểm tra nhãn phòng ban [Pháp lý]
      const deptTags = container.querySelectorAll('.ew-card__chain-item.is-prohibited .ew-dept-tag')
      expect(deptTags).toHaveLength(3)
      deptTags.forEach(tag => {
        expect(tag).toHaveTextContent('[Pháp lý]')
      })

      // Kiểm tra icon cấm (Ban) được gắn sẵn
      const banIcons = container.querySelectorAll('.ew-card__chain-item.is-prohibited .ew-prohibit-icon')
      expect(banIcons).toHaveLength(3)

      // Kiểm tra tooltip cảnh báo không có quyền nhận
      expect(prohibitedItems[0].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Không có quyền nhận)')
      expect(prohibitedItems[1].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Không có quyền nhận)')
      expect(prohibitedItems[2].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Không có quyền nhận)')

      // Nút "Nhận trọn" cho Đo vẽ hiển thị đầy đủ
      const claimBtn = screen.getByRole('button', { name: /Nhận trọn/i })
      expect(claimBtn).toBeInTheDocument()
      expect(claimBtn).not.toBeDisabled()
    })

    it('1.2. Visual Scan Không gian thực hiện (NodeChain): N03-N05 hiển thị THUỘC PHÁP LÝ, icon Ban, bị vô hiệu hóa', () => {
      const onSelectMock = vi.fn()
      const nodesForSurvey = relayRace7Nodes.map(n => ({
        ...n,
        is_my_department: n.pool_department_code === 'SURVEY',
      }))

      render(
        <ToastProvider>
          <NodeChain
            nodes={nodesForSurvey}
            activeNodeId="node-01"
            openableIds={new Set(['node-01', 'node-02', 'node-06', 'node-07'])}
            onSelect={onSelectMock}
            employeeDepartmentCode="SURVEY"
          />
        </ToastProvider>,
      )

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(7)

      // N01 đang mở và có thể bấm
      expect(buttons[0]).not.toBeDisabled()
      expect(buttons[0].className).toContain('is-current')

      // N03, N04, N05 (vị trí 2, 3, 4) phải bị cấm (is-prohibited, disabled)
      ;[2, 3, 4].forEach(idx => {
        expect(buttons[idx]).toBeDisabled()
        expect(buttons[idx].className).toContain('is-prohibited')
        expect(buttons[idx].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Bạn không có quyền thao tác)')
        expect(buttons[idx]).toHaveTextContent('THUỘC PHÁP LÝ')
      })

      // Click vào N03 không kích hoạt onSelect
      fireEvent.click(buttons[2])
      expect(onSelectMock).not.toHaveBeenCalled()
    })

    it('1.3. Visual Scan Giao diện Khoá an toàn khi xem bước Pháp lý: Màn hình hiện .eiw-locked và thông báo rõ ràng', () => {
      const heldItem = {
        id: 'held-item-1',
        contract_id: '11/BK-2026',
        service_line_id: 'sl-01',
        service_line_name: 'Hồ sơ kỹ thuật thửa đất',
        customer_name: 'Nguyễn Văn Khách',
        current_task_node_id: 'node-03', // Đang trỏ vào bước Pháp lý
        current_node_code: 'N03',
        current_node_name: 'Soạn thảo hồ sơ pháp lý',
        nodes: relayRace7Nodes.map(n => ({
          ...n,
          is_my_department: n.pool_department_code === 'SURVEY',
        })),
      }

      render(
        <ToastProvider>
          <EmployeeItemWorkspace
            item={heldItem}
            tasks={[
              { id: 'node-01', node_code: 'N01', name: 'Khảo sát', status: 'accepted' },
              { id: 'node-02', node_code: 'N02', name: 'Đo vẽ', status: 'accepted' },
            ]}
            employee={employeeSurvey}
            employeeDepartmentCode="SURVEY"
            onBack={vi.fn()}
          />
        </ToastProvider>,
      )

      // Phải có section khoá bảo vệ
      expect(screen.getByText(/Bước này thuộc Phòng Pháp lý\. Bạn không có quyền thao tác\./i)).toBeInTheDocument()
      // Không render thanh nút nộp nghiệm thu / bắt đầu làm của bước này
      expect(screen.queryByTestId('node-primary-action')).not.toBeInTheDocument()
    })

    it('1.4. Visual Scan Thẻ đang giữ của Đo vẽ: Sau khi N02 hoàn thành, thẻ báo ● Chờ Phòng Pháp lý và nút chuyển thành Mở xem chuỗi', () => {
      const heldSurveyItemWaiting = {
        id: 'held-item-1',
        contract_id: '11/BK-2026',
        service_line_id: 'sl-01',
        service_line_name: 'Hồ sơ kỹ thuật thửa đất',
        customer_name: 'Nguyễn Văn Khách',
        current_task_node_id: 'node-03',
        current_node_code: 'N03',
        current_node_name: 'Soạn thảo hồ sơ pháp lý',
        current_node_status: 'ready',
        steps_done: 2,
        steps_total: 7,
        nodes: relayRace7Nodes.map((n, idx) => ({
          ...n,
          status: idx < 2 ? 'accepted' : idx === 2 ? 'ready' : 'pending',
          is_my_department: n.pool_department_code === 'SURVEY',
        })),
      }

      render(
        <ToastProvider>
          <EmployeeWorkspace
            employee={employeeSurvey}
            taskPool={{ items: [], restrictions: { wip_limit: 3, held_items: 1 } }}
            heldItems={[heldSurveyItemWaiting]}
          />
        </ToastProvider>,
      )

      // Thẻ báo chờ phòng Pháp lý
      expect(screen.getByText(/● Chờ Phòng Pháp lý/i)).toBeInTheDocument()
      // Nút mở chuyển sang chế độ chỉ xem chuỗi
      expect(screen.getByRole('button', { name: 'Mở xem chuỗi' })).toBeInTheDocument()
      // Nút SOS nhường việc bị disabled
      const sosBtn = screen.getByRole('button', { name: /Nhờ hỗ trợ/i })
      expect(sosBtn).toBeDisabled()
      expect(sosBtn.getAttribute('title')).toContain('Bước này thuộc phòng ban khác')
    })
  })

  // =========================================================================
  // VAI TRÒ 2: PHÁP LÝ (Anh B - Legal)
  // =========================================================================
  describe('Vai trò Pháp lý (Anh B)', () => {
    const employeeLegal = {
      id: 'emp-legal-b',
      full_name: 'Trần Thị B',
      department: 'Pháp lý',
      department_code: 'LEGAL',
      department_name: 'Phòng Pháp lý',
    }

    it('2.1. Visual Scan Bể việc Pháp lý khi Đo vẽ chưa xong (N01, N02 đang làm): Bể việc trống hoàn toàn', () => {
      render(
        <ToastProvider>
          <EmployeeWorkspace
            employee={employeeLegal}
            taskPool={{
              department: 'Pháp lý',
              department_code: 'LEGAL',
              items: [], // Trống vì N03 đang pending
              restrictions: { wip_limit: 3, held_items: 0 },
            }}
            heldItems={[]}
          />
        </ToastProvider>,
      )

      // Bể việc hiển thị trạng thái sạch sẽ, không có việc nào trong nhóm này
      expect(screen.getByText('Không có việc nào trong nhóm này.')).toBeInTheDocument()
    })

    it('2.2. Visual Scan Bể việc Pháp lý ngay khi N02 duyệt xong: N03 xuất hiện, các bước Đo vẽ (1, 2, 6, 7) bị cấm với tag [Đo vẽ]', () => {
      const taskPoolForLegal = {
        department: 'Pháp lý',
        department_code: 'LEGAL',
        department_name: 'Phòng Pháp lý',
        items: [
          {
            id: 'pool-legal-item-1',
            contract_id: 'HĐ 11/BK-2026',
            service_line_id: 'sl-01',
            service_line_name: 'Hồ sơ kỹ thuật thửa đất',
            customer_name: 'Nguyễn Văn Khách',
            node_code: 'N03',
            node_name: 'Soạn thảo hồ sơ pháp lý',
            chain_nodes: relayRace7Nodes.map((n, idx) => ({
              ...n,
              status: idx < 2 ? 'accepted' : idx === 2 ? 'ready' : 'pending',
              is_my_department: n.pool_department_code === 'LEGAL',
            })),
            chain_codes: ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07'],
            step_count: 7,
            groups: ['CHAIN'],
            can_claim: true,
            chain_amount: 2_800_000,
          },
        ],
        restrictions: { wip_limit: 3, held_items: 0 },
      }

      const { container } = render(
        <ToastProvider>
          <EmployeeWorkspace
            employee={employeeLegal}
            taskPool={taskPoolForLegal}
            heldItems={[]}
          />
        </ToastProvider>,
      )

      // Thẻ Hạng mục chứa bước N03 xuất hiện trong Bể việc Pháp lý
      expect(screen.getByText('Hồ sơ kỹ thuật thửa đất')).toBeInTheDocument()
      expect(screen.getByText('N03')).toBeInTheDocument()

      // Các bước thuộc Đo vẽ (N01, N02, N06, N07: tổng cộng 4 bước) phải mang tag [Đo vẽ] và class is-prohibited
      const prohibitedItems = container.querySelectorAll('.ew-card__chain-item.is-prohibited')
      expect(prohibitedItems).toHaveLength(4)

      const deptTags = container.querySelectorAll('.ew-card__chain-item.is-prohibited .ew-dept-tag')
      expect(deptTags).toHaveLength(4)
      deptTags.forEach(tag => {
        expect(tag).toHaveTextContent('[Đo vẽ]')
      })

      // Tooltip cảnh báo không có quyền nhận cho Anh B
      expect(prohibitedItems[0].getAttribute('title')).toContain('Thuộc Phòng Đo vẽ (Không có quyền nhận)')
      expect(prohibitedItems[2].getAttribute('title')).toContain('Thuộc Phòng Đo vẽ (Không có quyền nhận)')

      // Nút nhận việc cho Pháp lý hoạt động
      const claimBtn = screen.getByRole('button', { name: /Nhận trọn/i })
      expect(claimBtn).toBeInTheDocument()
      expect(claimBtn).not.toBeDisabled()
    })

    it('2.3. Visual Scan Pháp lý trong không gian làm việc: N03, N04, N05 thao tác được; các bước Đo vẽ khoá', () => {
      const nodesForLegal = relayRace7Nodes.map((n, idx) => ({
        ...n,
        status: idx < 2 ? 'accepted' : idx === 2 ? 'ready' : 'pending',
        is_my_department: n.pool_department_code === 'LEGAL',
      }))

      render(
        <ToastProvider>
          <NodeChain
            nodes={nodesForLegal}
            activeNodeId="node-03"
            openableIds={new Set(['node-03', 'node-04', 'node-05'])}
            onSelect={vi.fn()}
            employeeDepartmentCode="LEGAL"
          />
        </ToastProvider>,
      )

      const buttons = screen.getAllByRole('button')
      // N03 đang xử lý
      expect(buttons[2]).not.toBeDisabled()
      expect(buttons[2].className).toContain('is-current')

      // N01, N02, N06, N07 (vị trí 0, 1, 5, 6) phải bị cấm đối với Anh B
      ;[0, 1, 5, 6].forEach(idx => {
        expect(buttons[idx]).toBeDisabled()
        expect(buttons[idx].className).toContain('is-prohibited')
        expect(buttons[idx]).toHaveTextContent('THUỘC ĐO VẼ')
      })
    })
  })

  // =========================================================================
  // VAI TRÒ 3: GIÁM ĐỐC / QUẢN LÝ (Director / Manager)
  // =========================================================================
  describe('Vai trò Giám đốc / Quản lý', () => {
    it('3.1. Visual Scan Toàn cảnh 7 bước: Giám đốc thấy đủ trạng thái và truy cập được các bước', () => {
      // Giám đốc có quyền xem mọi bước
      const nodesForDirector = relayRace7Nodes.map((n, idx) => ({
        ...n,
        status: idx === 0 ? 'accepted' : idx === 1 ? 'submitted' : 'pending',
        is_my_department: true,
      }))

      render(
        <ToastProvider>
          <NodeChain
            nodes={nodesForDirector}
            activeNodeId="node-02"
            openableIds={new Set(nodesForDirector.map(n => n.id))}
            onSelect={vi.fn()}
            employeeDepartmentCode="DIRECTOR"
            isDirector={true}
          />
        </ToastProvider>,
      )

      const buttons = screen.getAllByRole('button')
      // Không bước nào bị gắn class is-prohibited đối với Giám đốc
      buttons.forEach(btn => {
        expect(btn.className).not.toContain('is-prohibited')
      })

      // N01 đã hoàn thành
      expect(buttons[0]).toHaveTextContent('ĐÃ HOÀN THÀNH')
      // N02 đang xử lý / chờ nghiệm thu
      expect(buttons[1]).toHaveTextContent('ĐANG XỬ LÝ')
    })
  })

  // =========================================================================
  // VAI TRÒ 4: PHÒNG BAN KHÁC (Sales / Kế toán / CSKH)
  // =========================================================================
  describe('Vai trò Phòng ban khác (Sales / Kế toán)', () => {
    const employeeSales = {
      id: 'emp-sales-c',
      full_name: 'Lê Văn Sale',
      department: 'Sale / CSKH',
      department_code: 'SALES',
      department_name: 'Phòng Sale/CSKH',
    }

    it('4.1. Visual Scan Bể việc phòng Sale: Thẻ Đo vẽ / Pháp lý không cho nhận (can_claim=false)', () => {
      const taskPoolForSales = {
        department: 'Sale / CSKH',
        department_code: 'SALES',
        items: [
          {
            id: 'pool-other-item',
            contract_id: 'HĐ 11/BK-2026',
            service_line_id: 'sl-01',
            service_line_name: 'Hồ sơ kỹ thuật thửa đất',
            customer_name: 'Nguyễn Văn Khách',
            node_code: 'N01',
            node_name: 'Khảo sát hiện trường',
            chain_nodes: relayRace7Nodes.map(n => ({
              ...n,
              is_my_department: false, // Sales không phụ trách bước nào trong 7 bước này
            })),
            chain_codes: ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07'],
            step_count: 7,
            groups: ['CHAIN'],
            can_claim: false,
            cannot_claim_reason: 'Bạn không thuộc phòng ban phụ trách bước này',
            chain_amount: 3_500_000,
          },
        ],
        restrictions: { wip_limit: 3, held_items: 0 },
      }

      const { container } = render(
        <ToastProvider>
          <EmployeeWorkspace
            employee={employeeSales}
            taskPool={taskPoolForSales}
            heldItems={[]}
          />
        </ToastProvider>,
      )

      // Toàn bộ 7 node đều bị gắn is-prohibited
      const prohibitedItems = container.querySelectorAll('.ew-card__chain-item.is-prohibited')
      expect(prohibitedItems).toHaveLength(7)

      // Nút nhận việc bị ẩn, thay bằng thông báo không thể nhận
      expect(screen.queryByRole('button', { name: /Nhận trọn chuỗi/i })).not.toBeInTheDocument()
      expect(screen.getByRole('note')).toHaveTextContent('Bạn không thuộc phòng ban phụ trách bước này')
    })

    it('4.2. Visual Scan Workspace khi Sales mở xem: Toàn bộ 7 bước đều hiện icon Ban và cấm thao tác', () => {
      const nodesForSales = relayRace7Nodes.map(n => ({
        ...n,
        is_my_department: false,
      }))

      render(
        <ToastProvider>
          <NodeChain
            nodes={nodesForSales}
            activeNodeId="node-01"
            openableIds={new Set()}
            onSelect={vi.fn()}
            employeeDepartmentCode="SALES"
          />
        </ToastProvider>,
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(btn => {
        expect(btn).toBeDisabled()
        expect(btn.className).toContain('is-prohibited')
      })
    })
  })
})
