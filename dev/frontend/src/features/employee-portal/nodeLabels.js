/**
 * Nhãn hiển thị cho trạng thái bước và lý do tạm dừng.
 * Dùng chung giữa EmployeeItemWorkspace và các card con.
 */

export const NODE_STATE_LABEL = {
  accepted: 'Đã xong',
  completed: 'Đã xong',
  in_progress: 'Đang thực hiện',
  submitted: 'Chờ giám đốc duyệt',
  ready: 'Sẵn sàng làm',
  rework_required: 'Cần sửa lại',
  pending: 'Chưa tới lượt',
  blocked: 'Bị chặn',
}

export const PAUSE_LABEL = {
  AGENCY: 'Chờ cơ quan',
  SURVEYOR: 'Chờ đo vẽ sửa',
  INTERNAL: 'Chờ nội bộ',
}
