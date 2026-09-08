/**
 * So sánh "sơ đồ đang sửa" với "sơ đồ đã lưu" để biết còn gì chưa cất.
 *
 * Tách khỏi ContractWorkflowDesigner vì đây là quy tắc nghiệp vụ có thể sai một
 * cách âm thầm: nhận nhầm thì hoặc chặn đường người dùng vô cớ, hoặc để họ mất
 * bài mà không một lời cảnh báo. Ở riêng thì kiểm bằng test được.
 */

/** Sorts object keys recursively so identical graphs produce the exact same serialized string. */
export function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
}

/**
 * Returns a stable fingerprint of business graph data (excluding UI coordinates).
 */
export function getGraphFingerprint(graph) {
  const { ui: _uiLayout, ...businessData } = graph || {};
  return JSON.stringify(sortObjectKeys(businessData));
}

// Backwards compatibility aliases
export const sapXepKhoa = sortObjectKeys;
export const dauVanTayGraph = getGraphFingerprint;
