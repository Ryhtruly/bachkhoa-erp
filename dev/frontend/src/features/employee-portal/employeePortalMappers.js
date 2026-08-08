export const displayDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value.slice(0, 10)}T00:00:00`)) : 'Chưa có dữ liệu'
export const displayMoney = (value) => value == null ? 'Chưa có dữ liệu' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
