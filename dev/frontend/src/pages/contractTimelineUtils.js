export function timelineMilestones(node) {
  return [
    ['Sẵn sàng', node.ready_at],
    ['Bắt đầu', node.started_at],
    ...((node.submissions || []).map((item) => [`Nộp #${item.attempt_no}`, item.submitted_at])),
    ['Hoàn tất', node.completed_at],
    ['Hạn xử lý', node.deadline_at],
  ].filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value }));
}
