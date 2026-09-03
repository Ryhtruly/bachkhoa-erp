/** Phép tính thuần cho khối hồ sơ nộp cơ quan (K05a · K05b).
 *
 * Tách khỏi component để test được không cần dựng React, và để file component
 * chỉ export đúng một component (điều kiện của fast refresh).
 */

/** Số ngày còn lại tới hạn. Âm là đã quá hạn, null khi chưa có ngày hẹn. */
export function daysUntil(value, now = new Date()) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const atMidnight = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((atMidnight(target) - atMidnight(now)) / 86400000);
}

/** Lần nộp gần nhất.
 *
 * Mã biên nhận và ngày hẹn phải lấy từ đây chứ không lấy từ thân hồ sơ: hồ sơ bị
 * trả rồi nộp lại thì mã và ngày hẹn của lần trước đã hết hiệu lực.
 */
export function latestSubmission(dossier) {
  const list = dossier?.submissions || [];
  return list.length ? list[list.length - 1] : null;
}

/** Ghi chú của lần tạm dừng ĐANG có hiệu lực.
 *
 * Duyệt ngược nhật ký để lấy mốc PENDING gần nhất — lấy mốc cũ là hiện sai lý do
 * cho lần dừng hiện tại.
 */
export function pauseNote(dossier) {
  if (dossier?.status !== 'PENDING') return null;
  const events = dossier.events || [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].to_status === 'PENDING') return events[i].note || null;
  }
  return null;
}
