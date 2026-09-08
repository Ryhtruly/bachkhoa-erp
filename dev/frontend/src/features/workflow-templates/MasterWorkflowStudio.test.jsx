import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MasterWorkflowStudio, { makeStarterFlow } from './MasterWorkflowStudio'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  peekApiCache: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({
  addEdge: (_connection, edges) => edges,
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({ children, nodes = [], nodeTypes = {}, onNodeClick }) => (
    <div data-testid="react-flow-canvas">
      {nodes.map((node) => {
        const NodeComponent = nodeTypes[node.type]
        return (
          <div
            key={node.id}
            data-testid={`flow-node-${node.id}`}
            onClick={(e) => onNodeClick?.(e, node)}
          >
            {NodeComponent ? (
              <NodeComponent id={node.id} data={node.data} selected={false} />
            ) : (
              <span>{node.data.label}</span>
            )}
          </div>
        )
      })}
      {children}
    </div>
  ),
  useEdgesState: (initial) => {
    const [edges, setEdges] = React.useState(initial)
    return [edges, setEdges, vi.fn()]
  },
  useNodesState: (initial) => {
    const [nodes, setNodes] = React.useState(initial)
    return [nodes, setNodes, vi.fn()]
  },
}))

const mockPackages = [
  {
    id: 'sp_001',
    name: 'Đo Vẽ',
    task_types: [
      { id: 'tt_001', name: 'Tách thửa' },
      { id: 'tt_002', name: 'Cắm mốc' },
    ],
  },
  {
    id: 'sp_002',
    name: 'Pháp Lý',
    task_types: [{ id: 'tt_010', name: 'Cấp đổi sổ' }],
  },
]

const mockCatalogNodes = [
  { code: 'K01', name: 'Tiếp nhận hồ sơ', description: 'Ký kết & tiếp nhận' },
  { code: 'K02', name: 'Khảo sát thực địa', description: 'Đo đạc hiện trạng' },
  { code: 'K03', name: 'Xử lý nội nghiệp', description: 'Vẽ sơ đồ trích đo' },
]

const mockDocTemplates = {
  data: {
    groups: [
      {
        templates: [
          {
            id: 'dt_01',
            name: 'Bản vẽ trích đo địa chính',
            source: 'CONG_TY',
            applicabilities: [{ applicability_type: 'GLOBAL', node_code: 'K01' }],
          },
          {
            id: 'dt_02',
            name: 'Biên bản áp ranh',
            source: 'CONG_TY',
            applicabilities: [{ applicability_type: 'GLOBAL', node_code: 'K02' }],
          },
        ],
      },
    ],
  },
}

const mockWorkflowTemplates = [
  {
    id: 'TPL-001',
    name: 'Quy trình Tách thửa chuẩn - V1',
    description: 'Mẫu quy trình cơ bản',
    service_package_id: 'sp_001',
    task_type_id: 'tt_001',
    is_default: true,
    version: 1,
    graph: {
      start_node: 'k01',
      nodes: {
        k01: {
          task_code: 'K01',
          name: 'Tiếp nhận hồ sơ',
          duration_days: 1,
          duration_hours: 0,
          pool_department_code: 'Kinh doanh',
          checklist: [
            {
              key: 'cl_1',
              name: 'Kiểm tra giấy tờ pháp lý ban đầu',
              required: true,
              require_evidence: false,
              output_documents: [],
            },
          ],
          transitions: { COMPLETED_1: 'k02' },
        },
        k02: {
          task_code: 'K02',
          name: 'Khảo sát thực địa',
          duration_days: 2,
          duration_hours: 0,
          pool_department_code: 'Đo đạc',
          checklist: [],
          transitions: {},
        },
      },
      ui: {
        k01: { x: 80, y: 180 },
        k02: { x: 350, y: 180 },
      },
    },
  },
]

describe('MasterWorkflowStudio — Thiết kế quy trình mẫu theo Combo', () => {
  beforeEach(() => {
    apiFetch.mockImplementation((path) => {
      if (path === '/api/catalog/service-packages') {
        return Promise.resolve({ data: mockPackages })
      }
      if (path === '/api/document-register/workflow-nodes') {
        return Promise.resolve({ data: mockCatalogNodes })
      }
      if (path === '/api/document-register/templates') {
        return Promise.resolve(mockDocTemplates)
      }
      if (path.startsWith('/api/contracts/workflow/templates')) {
        return Promise.resolve({ data: mockWorkflowTemplates })
      }
      return Promise.resolve({ data: [] })
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('tải danh mục combo, chọn sẵn gói đầu và nạp mẫu quy trình mặc định', async () => {
    render(<MasterWorkflowStudio />)

    expect(await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /hạng mục/i })).toHaveValue('tt_001')

    // Tên mẫu mặc định hiển thị trên dropdown mẫu
    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    // Node trên canvas hiển thị
    expect(screen.getByText('Tiếp nhận hồ sơ')).toBeInTheDocument()
    expect(screen.getByText('Khảo sát thực địa')).toBeInTheDocument()
  })

  it('hiển thị ghi chú định hướng "Quy trình này dùng cho..." khi rê chuột vào dòng tên quy trình trong dropdown', async () => {
    render(<MasterWorkflowStudio />)

    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    // Bấm mở dropdown mẫu quy trình
    const templateTrigger = document.querySelector('.workflow-template-select .custom-select-trigger')
    fireEvent.click(templateTrigger)

    // Option trong dropdown có title và description
    const menu = await screen.findByRole('listbox')
    const option = within(menu).getByRole('option', { name: /Quy trình Tách thửa chuẩn - V1/ })
    expect(option).toHaveAttribute('title', 'Quy trình này dùng cho: Mẫu quy trình cơ bản')
    expect(within(option).getByText('Quy trình này dùng cho: Mẫu quy trình cơ bản')).toBeInTheDocument()
  })

  it('cho phép Giám đốc đặt tên checklist hoàn toàn tự do', async () => {
    render(<MasterWorkflowStudio />)

    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    // Click vào node K01 trên canvas để mở Inspector
    const nodeK01 = screen.getByTestId('flow-node-k01')
    fireEvent.click(nodeK01)

    // Inspector mở ra với checklist hiện có
    expect(await screen.findByDisplayValue('Kiểm tra giấy tờ pháp lý ban đầu')).toBeInTheDocument()

    // Sửa tên checklist thành tên tự do bất kỳ
    const checklistInput = screen.getByDisplayValue('Kiểm tra giấy tờ pháp lý ban đầu')
    fireEvent.change(checklistInput, { target: { value: 'Xác minh hiện trạng ranh đất di sản thừa kế' } })

    expect(screen.getByDisplayValue('Xác minh hiện trạng ranh đất di sản thừa kế')).toBeInTheDocument()
  })

  it('cho phép thêm mục checklist mới với tên tự do và gán tài liệu đầu ra', async () => {
    render(<MasterWorkflowStudio />)

    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    const nodeK01 = screen.getByTestId('flow-node-k01')
    fireEvent.click(nodeK01)

    // Bấm nút "+ Thêm mục"
    const addChecklistBtn = await screen.findByRole('button', { name: /thêm mục/i })
    fireEvent.click(addChecklistBtn)

    // Nhập tên tự do cho mục mới
    const emptyInputs = screen.getAllByPlaceholderText('Nhập tên nhiệm vụ tự do...')
    const newInput = emptyInputs[emptyInputs.length - 1]
    fireEvent.change(newInput, { target: { value: 'Lập biên bản thỏa thuận ranh' } })
    expect(screen.getByDisplayValue('Lập biên bản thỏa thuận ranh')).toBeInTheDocument()

    // Gán tài liệu đầu ra từ dropdown của mục mới thêm
    const docSelects = screen.getAllByRole('combobox').filter((el) =>
      el.textContent.includes('Gắn giấy tờ đầu ra') || el.textContent.includes('Gắn loại giấy tờ đầu ra')
    )
    const targetDocSelect = docSelects[docSelects.length - 1]
    expect(targetDocSelect).toBeInTheDocument()
    fireEvent.change(targetDocSelect, { target: { value: 'dt_01' } })

    // Nhãn giấy tờ hiển thị trong thẻ chip
    await waitFor(() => {
      expect(screen.getByText('Bản vẽ trích đo địa chính')).toBeInTheDocument()
    })
  })

  it('lưu mẫu quy trình thành công khi bấm [Lưu mẫu] và cập nhật dropdown ngay lập tức', async () => {
    apiFetch.mockImplementation((path, opts) => {
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          data: { id: 'TPL-001', name: 'Quy trình Tách thửa chuẩn - Đã sửa' },
        })
      }
      if (path === '/api/catalog/service-packages') return Promise.resolve({ data: mockPackages })
      if (path === '/api/document-register/workflow-nodes') return Promise.resolve({ data: mockCatalogNodes })
      if (path === '/api/document-register/templates') return Promise.resolve(mockDocTemplates)
      if (path.startsWith('/api/contracts/workflow/templates')) {
        return Promise.resolve({ data: mockWorkflowTemplates })
      }
      return Promise.resolve({ data: [] })
    })

    render(<MasterWorkflowStudio />)

    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    // Bấm nút Lưu mẫu trên toolbar
    const saveToolbarBtn = screen.getByRole('button', { name: /^lưu mẫu$/i })
    fireEvent.click(saveToolbarBtn)

    // Modal lưu mẫu quy trình mở ra
    const nameInput = await screen.findByPlaceholderText(/VD: Quy trình Cắm mốc chuẩn/i)
    fireEvent.change(nameInput, { target: { value: 'Quy trình Tách thửa chuẩn - Đã sửa' } })

    // Bấm nút Lưu mẫu quy trình trong modal
    const confirmSaveBtn = screen.getByRole('button', { name: /lưu mẫu quy trình/i })
    fireEvent.click(confirmSaveBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/contracts/workflow/templates/TPL-001',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Quy trình Tách thửa chuẩn - Đã sửa'),
        })
      )
    })
  })

  it('hiển thị đúng 5 phòng ban chuẩn, lọc tài liệu đầu ra theo đúng combo và loại trừ KHACH_HANG', async () => {
    const mockComboTemplates = {
      data: {
        groups: [
          {
            templates: [
              {
                id: 'dt_combo_1',
                name: 'Biên bản cắm mốc ranh giới',
                source: 'CONG_TY',
                applicabilities: [
                  { applicability_type: 'TASK_TYPE', task_type_id: 'tt_001', service_package_id: 'sp_001', node_code: 'K01' },
                ],
              },
              {
                id: 'dt_other_combo',
                name: 'Hồ sơ cấp đổi sổ đỏ',
                source: 'CONG_TY',
                applicabilities: [
                  { applicability_type: 'TASK_TYPE', task_type_id: 'tt_010', service_package_id: 'sp_002', node_code: 'K04' },
                ],
              },
              {
                id: 'dt_client_doc',
                name: 'CCCD/CMND khách hàng',
                source: 'KHACH_HANG',
                applicabilities: [
                  { applicability_type: 'TASK_TYPE', task_type_id: 'tt_001', service_package_id: 'sp_001', node_code: 'K01' },
                ],
              },
            ],
          },
        ],
      },
    }

    apiFetch.mockImplementation((path) => {
      if (path === '/api/catalog/service-packages') return Promise.resolve({ data: mockPackages })
      if (path === '/api/document-register/workflow-nodes') return Promise.resolve({ data: mockCatalogNodes })
      if (path === '/api/document-register/templates') return Promise.resolve(mockComboTemplates)
      if (path.startsWith('/api/contracts/workflow/templates')) {
        return Promise.resolve({ data: mockWorkflowTemplates })
      }
      return Promise.resolve({ data: [] })
    })

    render(<MasterWorkflowStudio />)
    await waitFor(() => {
      expect(document.querySelector('.workflow-template-select .custom-select-value')).toHaveTextContent(
        /Quy trình Tách thửa chuẩn - V1/
      )
    })

    // Click node K01 để mở inspector
    const nodeK01 = screen.getByTestId('flow-node-k01')
    fireEvent.click(nodeK01)

    // Kiểm tra dropdown phòng ban có đủ 5 phòng ban chuẩn
    const deptSelect = screen.getByRole('combobox', { name: /phòng ban phụ trách/i })
    expect(deptSelect).toBeInTheDocument()
    const deptOptions = Array.from(deptSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(deptOptions).toContain('Phòng Sale/CSKH')
    expect(deptOptions).toContain('Phòng Đo vẽ')
    expect(deptOptions).toContain('Phòng Pháp lý')
    expect(deptOptions).toContain('Phòng Kế toán')
    expect(deptOptions).toContain('Ban Giám đốc')

    // Kiểm tra dropdown tài liệu đầu ra CHỈ chứa tài liệu thuộc combo này (dt_combo_1)
    expect(screen.getByText(/Biên bản cắm mốc ranh giới/)).toBeInTheDocument()

    // KHÔNG chứa tài liệu thuộc combo khác
    expect(screen.queryByText(/Hồ sơ cấp đổi sổ đỏ/)).not.toBeInTheDocument()

    // KHÔNG chứa tài liệu nguồn Khách hàng cung cấp (chỉ cho phép tài liệu đầu ra)
    expect(screen.queryByText(/CCCD\/CMND khách hàng/)).not.toBeInTheDocument()
  })

  it('khởi tạo luồng mẫu không bao giờ có node K05 mà dùng K05a (Đo vẽ) hoặc K05b (Pháp lý)', () => {
    const surveyFlow = makeStarterFlow({ id: 'sp_001', name: 'Đo Vẽ' })
    const surveyCodes = surveyFlow.nodes.map((n) => n.data.code)
    expect(surveyCodes).not.toContain('K05')
    expect(surveyCodes).toContain('K05a')

    const legalFlow = makeStarterFlow({ id: 'sp_002', name: 'Pháp Lý' })
    const legalCodes = legalFlow.nodes.map((n) => n.data.code)
    expect(legalCodes).not.toContain('K05')
    expect(legalCodes).toContain('K05b')
  })
})
