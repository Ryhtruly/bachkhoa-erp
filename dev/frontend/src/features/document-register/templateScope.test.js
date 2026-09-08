import { describe, expect, it } from 'vitest'

import {
  assignmentsInScope, buildScopePayload, deriveScopeType, filterTemplates,
  flattenTemplates, matchesScope, packageOfTaskType,
} from './templateScope'

const PACKAGE_TREE = [
  {
    id: 'sp_001',
    name: 'Đo Vẽ',
    task_types: [
      { id: 'tt_006', name: 'Tách thửa' },
      { id: 'tt_002', name: 'Cắm mốc' },
    ],
  },
  { id: 'sp_002', name: 'Pháp Lý', task_types: [{ id: 'tt_010', name: 'Cấp đổi sổ' }] },
]

const scope = (over) => ({
  id: 'A-1', applicability_type: 'GLOBAL', service_package_id: null,
  task_type_id: null, node_code: null, is_default: true, ...over,
})

describe('Khớp phạm vi với ngữ cảnh đang đứng', () => {
  it('GLOBAL trúng mọi nơi', () => {
    expect(matchesScope(scope(), 'sp_001', 'tt_006')).toBe(true)
    expect(matchesScope(scope(), 'sp_002', 'tt_010')).toBe(true)
  })

  it('PACKAGE chỉ trúng gói của nó', () => {
    const row = scope({ applicability_type: 'PACKAGE', service_package_id: 'sp_001' })
    expect(matchesScope(row, 'sp_001', 'tt_006')).toBe(true)
    expect(matchesScope(row, 'sp_002', 'tt_010')).toBe(false)
  })

  it('TASK_TYPE chỉ trúng đúng hạng mục của nó', () => {
    // Đây là vế giữ tính độc lập: "Biên nhận ở Tách thửa" không được lộ ra khi
    // đang đứng ở Cắm mốc.
    const row = scope({ applicability_type: 'TASK_TYPE', task_type_id: 'tt_006' })
    expect(matchesScope(row, 'sp_001', 'tt_006')).toBe(true)
    expect(matchesScope(row, 'sp_001', 'tt_002')).toBe(false)
  })

  it('hình dạng lạ thì không trúng gì, không nổ', () => {
    expect(matchesScope(scope({ applicability_type: 'BAY_BA' }), 'sp_001', 'tt_006')).toBe(false)
    expect(matchesScope(undefined, 'sp_001', 'tt_006')).toBe(false)
  })
})

describe('Suy ra hình dạng phạm vi', () => {
  it('không gói không hạng mục là GLOBAL', () => {
    expect(deriveScopeType({})).toBe('GLOBAL')
  })
  it('chỉ có gói là PACKAGE', () => {
    expect(deriveScopeType({ service_package_id: 'sp_001' })).toBe('PACKAGE')
  })
  it('có hạng mục là TASK_TYPE, gói chỉ là bộ lọc', () => {
    expect(deriveScopeType({ service_package_id: 'sp_001', task_type_id: 'tt_006' }))
      .toBe('TASK_TYPE')
  })
})

describe('Lọc loại giấy cho Cột 2', () => {
  const templates = [
    {
      id: 'T-CCCD', name: 'CCCD', source: 'KHACH_HANG',
      applicabilities: [scope({ id: 'A-1' })],
    },
    {
      id: 'T-BIENNHAN', name: 'Biên nhận', source: 'CO_QUAN',
      applicabilities: [scope({
        id: 'A-2', applicability_type: 'TASK_TYPE', task_type_id: 'tt_006', node_code: 'K05a',
      })],
    },
    {
      id: 'T-BANVE', name: 'Bản vẽ trích đo', source: 'CONG_TY',
      applicabilities: [scope({
        id: 'A-3', applicability_type: 'PACKAGE', service_package_id: 'sp_001', node_code: 'K03',
      })],
    },
  ]

  it('lọc đủ cả ba trục — gói, hạng mục và nhóm nguồn gốc', () => {
    const ket = filterTemplates(templates,
      { packageId: 'sp_001', taskTypeId: 'tt_006', source: 'CO_QUAN' })
    expect(ket.map(t => t.name)).toEqual(['Biên nhận'])
  })

  it('bỏ vế nhóm nguồn gốc là trộn giấy của ba ngăn vào một danh sách', () => {
    // Trúng phạm vi thì cả ba đều trúng; chính `source` mới tách chúng ra.
    const ket = filterTemplates(templates,
      { packageId: 'sp_001', taskTypeId: 'tt_006', source: null })
    expect(ket).toHaveLength(3)
  })

  it('hạng mục khác thì giấy khai riêng cho tt_006 biến mất', () => {
    const ket = filterTemplates(templates,
      { packageId: 'sp_001', taskTypeId: 'tt_002', source: 'CO_QUAN' })
    expect(ket).toEqual([])
  })

  it('sang gói khác thì giấy khai theo gói Đo Vẽ cũng biến mất', () => {
    const ket = filterTemplates(templates,
      { packageId: 'sp_002', taskTypeId: 'tt_010', source: 'CONG_TY' })
    expect(ket).toEqual([])
  })

  it('giấy dùng chung toàn công ty hiện ở mọi hạng mục', () => {
    for (const ctx of [
      { packageId: 'sp_001', taskTypeId: 'tt_006' },
      { packageId: 'sp_001', taskTypeId: 'tt_002' },
      { packageId: 'sp_002', taskTypeId: 'tt_010' },
    ]) {
      expect(filterTemplates(templates, { ...ctx, source: 'KHACH_HANG' }).map(t => t.name))
        .toEqual(['CCCD'])
    }
  })
})

describe('Bản ghi gán cho Cột 3', () => {
  const template = {
    id: 'T-1',
    applicabilities: [
      scope({ id: 'A-GLOBAL', node_code: 'K07' }),
      scope({ id: 'A-TT', applicability_type: 'TASK_TYPE', task_type_id: 'tt_006', node_code: 'K01' }),
      scope({ id: 'A-KHAC', applicability_type: 'TASK_TYPE', task_type_id: 'tt_002', node_code: 'K03' }),
    ],
  }

  it('chỉ lấy bản ghi của ngữ cảnh này, bản ghi hạng mục khác không lọt vào', () => {
    const ket = assignmentsInScope(template, 'sp_001', 'tt_006')
    expect(ket.map(a => a.id)).toEqual(['A-TT', 'A-GLOBAL'])
    expect(ket.map(a => a.id)).not.toContain('A-KHAC')
  })

  it('sắp hẹp trước rộng sau — bản ghi riêng của hạng mục nằm trên cùng', () => {
    const ket = assignmentsInScope(template, 'sp_001', 'tt_006')
    expect(ket[0].scope_label).toBe('hạng mục này')
    expect(ket[1].scope_label).toBe('mọi gói')
  })

  it('trả kèm id của dòng — nút Sửa ghi theo id chứ không ghi cả cụm', () => {
    // Ghi cả cụm là xoá mất bản ghi của hạng mục khác.
    const ket = assignmentsInScope(template, 'sp_001', 'tt_006')
    expect(ket.every(a => Boolean(a.id))).toBe(true)
  })

  it('chưa gán bước thì node_code là null, không thành chuỗi rỗng', () => {
    const ket = assignmentsInScope(
      { applicabilities: [scope({ id: 'A-0', node_code: null })] }, 'sp_001', 'tt_006')
    expect(ket[0].node_code).toBeNull()
  })

  it('không có loại giấy thì trả mảng rỗng, không nổ', () => {
    expect(assignmentsInScope(null, 'sp_001', 'tt_006')).toEqual([])
  })
})

describe('Dựng payload từ ma trận modal Thêm mới', () => {
  it('mọi gói ra đúng một dòng GLOBAL', () => {
    const ket = buildScopePayload({
      globalAll: true, packageIds: ['sp_001'], taskTypeIds: ['tt_006'], nodeCode: 'K01',
    })
    expect(ket).toEqual([{
      applicability_type: 'GLOBAL', service_package_id: null, task_type_id: null,
      node_code: 'K01', is_default: true,
    }])
  })

  it('tick nhiều hạng mục ra nhiều dòng, cùng một bước', () => {
    // Node là Single-Select nên không bao giờ có tích chéo nhiều bước.
    const ket = buildScopePayload({
      globalAll: false, packageIds: [], taskTypeIds: ['tt_006', 'tt_002'], nodeCode: 'K01',
    })
    expect(ket).toHaveLength(2)
    expect(ket.map(r => r.task_type_id)).toEqual(['tt_006', 'tt_002'])
    expect(new Set(ket.map(r => r.node_code))).toEqual(new Set(['K01']))
    expect(ket.every(r => r.applicability_type === 'TASK_TYPE')).toBe(true)
  })

  it('tick cả gói ra dòng PACKAGE, không kèm hạng mục', () => {
    const ket = buildScopePayload({
      globalAll: false, packageIds: ['sp_002'], taskTypeIds: [], nodeCode: 'K05b',
    })
    expect(ket).toEqual([{
      applicability_type: 'PACKAGE', service_package_id: 'sp_002', task_type_id: null,
      node_code: 'K05b', is_default: true,
    }])
  })

  it('chưa chọn bước thì node_code là null, không phải chuỗi rỗng', () => {
    // Chuỗi rỗng lọt xuống DB sẽ vi phạm khoá ngoại tới workflow_nodes.
    const [row] = buildScopePayload({
      globalAll: true, packageIds: [], taskTypeIds: [], nodeCode: '',
    })
    expect(row.node_code).toBeNull()
  })

  it('chưa tick phạm vi nào thì không sinh dòng nào', () => {
    expect(buildScopePayload({
      globalAll: false, packageIds: [], taskTypeIds: [], nodeCode: 'K01',
    })).toEqual([])
  })
})

describe('Tiện ích', () => {
  it('flattenTemplates gom mọi nhóm thành một danh sách', () => {
    expect(flattenTemplates([
      { items: [{ id: 'T-1' }, { id: 'T-2' }] },
      { items: [{ id: 'T-3' }] },
      { },
    ]).map(t => t.id)).toEqual(['T-1', 'T-2', 'T-3'])
  })

  it('packageOfTaskType tra ngược gói cha', () => {
    expect(packageOfTaskType(PACKAGE_TREE, 'tt_010')?.name).toBe('Pháp Lý')
    expect(packageOfTaskType(PACKAGE_TREE, 'khong-co')).toBeNull()
  })
})
