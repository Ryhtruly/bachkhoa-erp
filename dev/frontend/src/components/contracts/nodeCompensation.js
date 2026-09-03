/** Phép tính tiền khoán của Node — tách riêng khỏi component để Fast Refresh
 *  không mất trạng thái mỗi lần sửa hàm thuần. */

/**
 * Tiền khoán của một đầu việc theo vai trò.
 *
 * Đây là số SUY RA từ bảng giá (`work_item.rates`), không phải ô cho nhập tay:
 * cho nhập tay thì mỗi Node một giá, và bảng giá chung thành vô nghĩa.
 */
export function payRateFor(workItem, roleCode) {
  if (!workItem) return 0;
  const rates = workItem.rates || [];
  const matched = roleCode && rates.find(rate => rate.role_code === roleCode);
  return Number((matched || rates[0])?.amount || 0);
}
