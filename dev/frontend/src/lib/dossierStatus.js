/**
 * Hồ sơ đã kết thúc và bị khoá sửa chưa.
 *
 * Trước đây file này giữ HAI danh sách khác nhau cho hai phân hệ:
 *
 *     Đo vẽ  : { 'Hoàn thành', 'Nộp thành công' }        ← thiếu 'Huỷ'
 *     Pháp lý: { 'Hoàn thành' }                          ← thiếu 2 giá trị
 *
 * Nên cùng một hồ sơ, bên Đo vẽ khoá mà bên Pháp lý vẫn cho sửa. Và cả hai đều
 * đoán lại thứ mà backend đã biết chắc.
 *
 * Từ nay chỉ có MỘT nguồn sự thật: cờ `is_locked` do backend tính. Frontend
 * không tự quyết định nữa.
 */

// Chỉ dùng khi backend chưa kịp trả `is_locked` (dữ liệu cũ trong bộ nhớ đệm).
// Phải khớp với TERMINAL_DOSSIER_STATUSES bên backend.
const TERMINAL_STATUSES = new Set(['Hoàn thành', 'Nộp thành công', 'Huỷ', 'CLOSED'])

/**
 * @param {object|null} record Bản ghi hồ sơ do API trả về
 * @param {string} [fallbackStatus] Trạng thái để suy ra khi thiếu cờ is_locked
 */
export function isDossierLocked(record, fallbackStatus) {
  if (record && typeof record.is_locked === 'boolean') return record.is_locked
  const status = fallbackStatus ?? record?.status ?? record?.gov_status
  return TERMINAL_STATUSES.has(status)
}
