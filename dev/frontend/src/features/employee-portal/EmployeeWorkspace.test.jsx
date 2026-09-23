import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EmployeeWorkspace from './EmployeeWorkspace'

afterEach(cleanup)

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(async () => ({})),
  getAccessToken: vi.fn(() => 'token'),
  prefetchApi: vi.fn(),
  peekApiCache: vi.fn(),
}))

vi.mock('../../components/AvatarImage', () => ({
  default: () => <div data-testid="avatar" />,
}))

vi.mock('./CompletedItemsModal', () => ({
  default: () => null,
}))

vi.mock('./PoolItemDetailModal', () => ({
  default: () => null,
}))

vi.mock('./EmployeeWorkspaceCalendar', () => ({
  default: () => <div data-testid="calendar" />,
}))

describe('EmployeeWorkspace — Bể việc và Thẻ hạng mục đa phòng ban', () => {
  const employeeSurvey = {
    id: 'emp-1',
    code: 'NV01',
    full_name: 'Nguyễn Văn Đo Vẽ',
    department: 'Đo vẽ',
    department_code: 'SURVEY',
  }

  const sample7Nodes = [
    { task_node_id: 'n1', node_code: 'K01', name: 'Tiếp nhận', status: 'completed', department_code: 'SURVEY', department_name: 'Phòng Đo vẽ', is_my_department: true },
    { task_node_id: 'n2', node_code: 'K02', name: 'Đo hiện trường', status: 'in_progress', department_code: 'SURVEY', department_name: 'Phòng Đo vẽ', is_my_department: true },
    { task_node_id: 'n3', node_code: 'K03', name: 'Soạn hồ sơ', status: 'pending', department_code: 'LEGAL', department_name: 'Phòng Pháp lý', is_my_department: false },
    { task_node_id: 'n4', node_code: 'K04', name: 'Thẩm định', status: 'pending', department_code: 'LEGAL', department_name: 'Phòng Pháp lý', is_my_department: false },
    { task_node_id: 'n5', node_code: 'K05', name: 'Nộp hồ sơ', status: 'pending', department_code: 'SURVEY', department_name: 'Phòng Đo vẽ', is_my_department: true },
    { task_node_id: 'n6', node_code: 'K06', name: 'Bàn giao', status: 'pending', department_code: 'SURVEY', department_name: 'Phòng Đo vẽ', is_my_department: true },
    { task_node_id: 'n7', node_code: 'K07', name: 'Hoàn tất', status: 'pending', department_code: 'SURVEY', department_name: 'Phòng Đo vẽ', is_my_department: true },
  ]

  describe('Thẻ chuỗi trong Bể việc (ChainPoolCard)', () => {
    const taskPoolData = {
      department_code: 'SURVEY',
      items: [
        {
          id: 'pool-1',
          service_line_name: 'Đo đạc tách thửa',
          contract_id: 'HD-2026-001',
          customer_name: 'Trần Văn A',
          priority: 'NORMAL',
          available_roles: ['MAIN'],
          chain_amount: 5_000_000,
          chain_nodes: sample7Nodes,
          chain_codes: ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K07'],
          step_count: 7,
          groups: ['CHAIN'],
          can_claim: true,
        },
      ],
      restrictions: { wip_limit: 3, held_items: 0, active_in_progress: 0 },
    }

    it('hiển thị đầy đủ tất cả 7 node trong chuỗi', () => {
      render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={taskPoolData}
          heldItems={[]}
        />,
      )

      sample7Nodes.forEach((n) => {
        expect(screen.getByText(n.node_code)).toBeInTheDocument()
      })
    })

    it('node thuộc phòng Pháp lý (K03, K04) hiển thị tag [Pháp lý], class is-prohibited và icon cấm', () => {
      const { container } = render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={taskPoolData}
          heldItems={[]}
        />,
      )

      const prohibitedItems = container.querySelectorAll('.ew-card__chain-item.is-prohibited')
      expect(prohibitedItems).toHaveLength(2)

      const deptTags = container.querySelectorAll('.ew-dept-tag')
      expect(deptTags).toHaveLength(2)
      expect(deptTags[0]).toHaveTextContent('[Pháp lý]')
      expect(deptTags[1]).toHaveTextContent('[Pháp lý]')

      const prohibitIcons = container.querySelectorAll('.ew-prohibit-icon')
      expect(prohibitIcons).toHaveLength(2)
    })

    it('tooltip của node bị cấm trong bể việc cảnh báo rõ không có quyền nhận', () => {
      const { container } = render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={taskPoolData}
          heldItems={[]}
        />,
      )

      const prohibitedItems = container.querySelectorAll('.ew-card__chain-item.is-prohibited')
      expect(prohibitedItems[0].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Không có quyền nhận)')
    })

    it('nút Nhận trọn của thẻ không có cluster cũng chỉ phân công, chưa bắt đầu node', () => {
      const onClaim = vi.fn()
      render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={taskPoolData}
          heldItems={[]}
          onClaim={onClaim}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Nhận trọn' }))
      expect(onClaim).toHaveBeenCalledWith('pool-1', 'MAIN', false)
    })
  })

  describe('Thẻ hạng mục đã nhận (HeldItemCard)', () => {
    const heldItemData = [
      {
        workflow_instance_id: 'wf-1',
        contract_id: 'HD-2026-001',
        service_line_name: 'Đo đạc tách thửa',
        customer_name: 'Trần Văn A',
        current_node_code: 'K02',
        current_node_name: 'Đo hiện trường',
        current_node_status: 'in_progress',
        current_task_node_id: 'n2',
        steps_done: 1,
        steps_total: 7,
        amount_earned: 1_000_000,
        amount_total: 5_000_000,
        nodes: sample7Nodes.map((n) => ({
          ...n,
          id: n.task_node_id,
          mine: n.is_my_department,
          pool_department_code: n.department_code,
        })),
      },
    ]

    it('hiển thị dải 7 node trên thẻ đã nhận với nhãn phòng ban cho node khác phòng', () => {
      const { container } = render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={{ items: [], restrictions: {} }}
          heldItems={heldItemData}
        />,
      )

      const chainItems = container.querySelectorAll('.ew-held__chain .ew-card__chain-item')
      expect(chainItems).toHaveLength(7)

      const prohibited = container.querySelectorAll('.ew-held__chain .ew-card__chain-item.is-prohibited')
      expect(prohibited).toHaveLength(2)

      const deptTags = container.querySelectorAll('.ew-held__chain .ew-dept-tag')
      expect(deptTags).toHaveLength(2)
      expect(deptTags[0]).toHaveTextContent('[Pháp lý]')
    })

    it('thanh StepMeter đánh dấu ô bị cấm cho node khác phòng ban', () => {
      const { container } = render(
        <EmployeeWorkspace
          employee={employeeSurvey}
          taskPool={{ items: [], restrictions: {} }}
          heldItems={heldItemData}
        />,
      )

      const stepCells = container.querySelectorAll('.ew-steps__cell')
      expect(stepCells).toHaveLength(7)

      const prohibitedCells = container.querySelectorAll('.ew-steps__cell.is-prohibited')
      expect(prohibitedCells).toHaveLength(2)
    })
  })
})
