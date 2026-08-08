export const profileTabs = [
  { id: 'general', label: 'Thông tin chung' },
  { id: 'resume', label: 'Sơ yếu lý lịch' },
  { id: 'work', label: 'Công việc & hợp đồng' },
  { id: 'salary', label: 'Lương & phúc lợi' },
  { id: 'leave', label: 'Thông tin phép' },
]

export function formatDate(value) {
  if (!value) return 'Chưa có dữ liệu'
  return new Intl.DateTimeFormat('vi-VN').format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

export function formatMoney(value) {
  if (value === null || value === undefined) return 'Chưa có dữ liệu'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function employeeStatus(employee) {
  return employee?.is_active ? 'Đang làm việc' : 'Ngừng hoạt động'
}
