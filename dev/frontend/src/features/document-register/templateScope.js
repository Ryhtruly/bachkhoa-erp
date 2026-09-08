/**
 * Phép đọc/ghi phạm vi áp dụng của loại giấy — tầng thuần, không React.
 *
 * Cây phân cấp nghiệp vụ là năm trục, mỗi nhánh một bản ghi độc lập:
 *
 *     Gói → Hạng mục → Nhóm nguồn gốc → Node thực thi → Loại giấy tờ
 *
 *   [Gói Đo vẽ]  → [Tách thửa]  → [Nhà nước] → [K05a] → Biên nhận
 *   [Gói Pháp lý] → [Cấp đổi sổ] → [Nhà nước] → [K05b] → Biên nhận
 *
 * Hai dòng đó không liên quan gì nhau. Sửa cái này để yên cái kia.
 *
 * Ba trục đầu nằm ở `document_template_applicabilities`; Nhóm nguồn gốc nằm trên
 * chính loại giấy (`source`, đúng một giá trị); Node nằm ở `node_code` của dòng
 * phạm vi. Một dòng phạm vi CHÍNH LÀ một bản ghi gán.
 *
 * Ba unique index của bảng khoá theo (template, phạm vi) và không tính node, nên
 * mỗi (loại giấy, hạng mục) đúng một bước — khớp luật nghiệp vụ: giấy chỉ nộp ở
 * bước sinh ra nó, các bước sau kế thừa từ Tủ hồ sơ chứ không bắt nộp lại.
 */

/** Nhãn ngắn cho từng hình dạng phạm vi, in cạnh mã bước ở Cột 3. */
export const SCOPE_LABELS = {
  TASK_TYPE: 'hạng mục này',
  PACKAGE: 'cả gói',
  GLOBAL: 'mọi gói',
}

// Hẹp trước, rộng sau. Bản ghi hẹp hơn là thứ Giám đốc vừa khai riêng cho hạng
// mục đang đứng, phải nằm trên cùng.
const SCOPE_ORDER = { TASK_TYPE: 0, PACKAGE: 1, GLOBAL: 2 }

/**
 * Suy ra hình dạng phạm vi từ những gì đã chọn.
 *
 * GLOBAL / PACKAGE / TASK_TYPE là chuyện của ràng buộc CHECK dưới DB, không phải
 * khái niệm người dùng cần học. Người dùng tick "mọi gói / gói nào / hạng mục
 * nào", hệ thống tự dịch.
 */
export function deriveScopeType(row) {
  if (row.task_type_id) return 'TASK_TYPE'
  if (row.service_package_id) return 'PACKAGE'
  return 'GLOBAL'
}

/**
 * Bản ghi gán này có áp dụng cho ngữ cảnh (gói, hạng mục) đang đứng không?
 *
 * GLOBAL trúng mọi nơi, PACKAGE trúng mọi hạng mục trong gói của nó, TASK_TYPE
 * chỉ trúng đúng hạng mục của nó. Cùng phép khớp mà `_APPLICABLE_TEMPLATES_QUERY`
 * bên backend đang dùng, chép sang JS để Cột 2/Cột 3 lọc tại chỗ.
 */
export function matchesScope(scope, packageId, taskTypeId) {
  const kind = scope?.applicability_type
  if (kind === 'GLOBAL') return true
  if (kind === 'PACKAGE') return Boolean(packageId) && scope.service_package_id === packageId
  if (kind === 'TASK_TYPE') return Boolean(taskTypeId) && scope.task_type_id === taskTypeId
  return false
}

/** `list_templates` trả về gom theo Dạng hồ sơ; màn 3 cột cần danh sách phẳng. */
export function flattenTemplates(groups) {
  return (groups || []).flatMap(group => group.items || [])
}

/**
 * Loại giấy nào hiện ở Cột 2 với ngữ cảnh (gói, hạng mục, nhóm nguồn gốc).
 *
 * Ba điều kiện đều bắt buộc. Bỏ vế `source` là trộn giấy khách đưa lẫn giấy cơ
 * quan trả vào một danh sách — đúng thứ ba tab nhóm sinh ra để tách.
 */
export function filterTemplates(templates, { packageId, taskTypeId, source }) {
  return (templates || []).filter(template => {
    if (source && template.source !== source) return false
    return (template.applicabilities || [])
      .some(scope => matchesScope(scope, packageId, taskTypeId))
  })
}

/**
 * Các bản ghi gán của một loại giấy trong đúng ngữ cảnh đang đứng — nội dung Cột 3.
 *
 * Trả về kèm `id` của dòng vì nút Sửa và nút gỡ ghi theo id: ghi cả cụm sẽ xoá
 * mất bản ghi của hạng mục khác.
 */
export function assignmentsInScope(template, packageId, taskTypeId) {
  return (template?.applicabilities || [])
    .filter(scope => matchesScope(scope, packageId, taskTypeId))
    .map(scope => ({
      id: scope.id,
      node_code: scope.node_code || null,
      scope_type: scope.applicability_type,
      scope_label: SCOPE_LABELS[scope.applicability_type] || scope.applicability_type,
      is_default: scope.is_default !== false,
    }))
    .sort((a, b) => (SCOPE_ORDER[a.scope_type] ?? 9) - (SCOPE_ORDER[b.scope_type] ?? 9))
}

/**
 * Ma trận đã tick ở modal Thêm mới → danh sách bản ghi gửi lên API.
 *
 * Một node duy nhất đi kèm mọi phạm vi được tick — Node là Single-Select nên
 * không bao giờ có chuyện nhân chéo nhiều node với nhiều hạng mục.
 *
 * `globalAll` loại trừ phần còn lại: đã "toàn công ty" thì tick thêm gói lẻ là
 * khai hai lần cùng một điều, và dòng GLOBAL vốn đã trùm hết.
 */
export function buildScopePayload({ globalAll, packageIds, taskTypeIds, nodeCode }) {
  const node = nodeCode || null
  if (globalAll) {
    return [{
      applicability_type: 'GLOBAL',
      service_package_id: null,
      task_type_id: null,
      node_code: node,
      is_default: true,
    }]
  }

  return [
    ...(taskTypeIds || []).map(id => ({
      applicability_type: 'TASK_TYPE',
      service_package_id: null,
      task_type_id: id,
      node_code: node,
      is_default: true,
    })),
    ...(packageIds || []).map(id => ({
      applicability_type: 'PACKAGE',
      service_package_id: id,
      task_type_id: null,
      node_code: node,
      is_default: true,
    })),
  ]
}

/** Gói cha của một hạng mục — để breadcrumb và ma trận biết mở nhánh nào. */
export function packageOfTaskType(packageTree, taskTypeId) {
  return (packageTree || []).find(pkg =>
    (pkg.task_types || []).some(type => type.id === taskTypeId)) || null
}
