export const WORKFLOW_OUTCOME_LABELS = {
  COMPLETED: 'Hoàn thành',
  ACCEPTED: 'Cơ quan đã tiếp nhận hồ sơ',
  NEED_SUPPLEMENT: 'Cần bổ sung hồ sơ',
  RESULT_AVAILABLE: 'Đã có kết quả',
};

export const WORKFLOW_NODE_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  ready: 'Sẵn sàng thực hiện',
  in_progress: 'Đang thực hiện',
  submitted: 'Chờ nghiệm thu',
  accepted: 'Đã nghiệm thu',
  rework_required: 'Cần làm lại',
  blocked: 'Đang bị vướng',
  skipped: 'Đã bỏ qua',
  cancelled: 'Đã hủy',
};

export const WORKFLOW_INSTANCE_STATUS_LABELS = {
  not_started: 'Chưa bắt đầu',
  running: 'Đang vận hành',
  paused: 'Tạm dừng',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};

export const WORKFLOW_REVISION_STATUS_LABELS = {
  draft: 'Bản nháp',
  active: 'Đang áp dụng',
  superseded: 'Đã được thay thế',
  discarded: 'Đã hủy bản nháp',
};

export const WORKFLOW_TEMPLATE_STATUS_LABELS = {
  draft: 'Bản nháp',
  published: 'Đang áp dụng',
  archived: 'Ngừng áp dụng',
};

export const DEFAULT_WORKFLOW_LABELS = {
  outcomes: WORKFLOW_OUTCOME_LABELS,
  node_statuses: WORKFLOW_NODE_STATUS_LABELS,
  instance_statuses: WORKFLOW_INSTANCE_STATUS_LABELS,
  revision_statuses: WORKFLOW_REVISION_STATUS_LABELS,
  template_statuses: WORKFLOW_TEMPLATE_STATUS_LABELS,
};

export function workflowLabel(dictionary, code, fallback = 'Chưa xác định') {
  if (!code) return fallback;
  return dictionary[code] || fallback;
}
