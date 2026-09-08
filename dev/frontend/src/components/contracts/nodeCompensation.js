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
  if (matched) return Number(matched.amount || 0);

  const mainRate = rates.find(rate => rate.role_code === 'MAIN');
  if (mainRate) return Number(mainRate.amount || 0);

  const nonZeroRate = rates.find(rate => Number(rate.amount) > 0);
  if (nonZeroRate) return Number(nonZeroRate.amount || 0);

  return Number(rates[0]?.amount || 0);
}

