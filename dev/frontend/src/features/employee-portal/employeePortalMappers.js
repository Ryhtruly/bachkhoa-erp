export const displayDate = (value) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value.slice(0, 10)}T00:00:00`)) : 'Chưa có dữ liệu'
export const displayMoney = (value) => value == null ? 'Chưa có dữ liệu' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)

const TASK_STATUS_COLORS = {
  pending: '#94a3b8',
  ready: '#14b8a6',
  in_progress: '#f59e0b',
  submitted: '#3b82f6',
  accepted: '#22a06b',
  rework_required: '#ef4444',
  blocked: '#ef4444',
  skipped: '#64748b',
  cancelled: '#64748b',
}

// Deadline vẫn nằm trong task để tính quá hạn. Event trên timetable chỉ dùng
// một khối hiển thị gọn, không kéo dài từ lúc bắt đầu tới tận deadline.
const TIMETABLE_CARD_DURATION_MS = 2 * 60 * 60 * 1000

export const taskStatusColor = (status) => TASK_STATUS_COLORS[status] || TASK_STATUS_COLORS.pending

// Map hồ sơ công việc từ /api/employee-portal/me thành event cho FullCalendar.
// Node chỉ có lịch thật sau khi nhân viên bắt đầu; toàn bộ checklist dùng chung deadline_at.
export const mapTasksToCalendarEvents = (tasks = []) => tasks
  .filter((task) => task.started_at)
  .map((task) => {
    const start = new Date(task.started_at)
    const end = new Date(start.getTime() + TIMETABLE_CARD_DURATION_MS)
    const color = taskStatusColor(task.status)
    return {
      id: task.id,
      title: task.name || task.node_code,
      start,
      end,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { task },
    }
  })
