const FINISHED_NODE_STATUSES = new Set(['accepted', 'skipped']);

function validTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function earliestValue(values) {
  return values.reduce((earliest, value) => {
    const timestamp = validTimestamp(value);
    if (timestamp === null) return earliest;
    if (!earliest || timestamp < earliest.timestamp) return { value, timestamp };
    return earliest;
  }, null)?.value || null;
}

function latestValue(values) {
  return values.reduce((latest, value) => {
    const timestamp = validTimestamp(value);
    if (timestamp === null) return latest;
    if (!latest || timestamp > latest.timestamp) return { value, timestamp };
    return latest;
  }, null)?.value || null;
}

export function nodeActualDurationSeconds(node, nowMs = Date.now()) {
  const persisted = Number(node?.execution_data?.actual_duration_seconds || 0);
  if (Number.isFinite(persisted) && persisted > 0) return Math.floor(persisted);

  const startedAt = validTimestamp(node?.started_at);
  if (startedAt === null) return 0;

  const stoppedAt = validTimestamp(
    node?.completed_at || node?.accepted_at || node?.submitted_at,
  );
  if (stoppedAt !== null) {
    return Math.max(0, Math.floor((stoppedAt - startedAt) / 1000));
  }

  if (node?.status === 'in_progress') {
    return Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  }

  return 0;
}

export function formatWorkflowDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${days} ngày ${hours} giờ ${minutes} phút`;
}

export function calculateWorkflowProgress(runtimeNodes = [], workflowStatus, nowMs = Date.now()) {
  if (!runtimeNodes.length) return null;

  const finished = runtimeNodes.filter(node => FINISHED_NODE_STATUSES.has(node.status));
  const completed = workflowStatus === 'completed';
  const actualEndValues = runtimeNodes.map(
    node => node.completed_at || node.accepted_at || node.submitted_at,
  );
  const plannedEndValues = runtimeNodes.map(node => node.deadline_at);

  return {
    finished: finished.length,
    total: runtimeNodes.length,
    percent: Math.round((finished.length / runtimeNodes.length) * 100),
    startedAt: earliestValue(runtimeNodes.map(node => node.started_at)),
    endAt: latestValue(completed ? actualEndValues : plannedEndValues),
    endLabel: completed ? 'KẾT THÚC' : 'KẾT THÚC DỰ KIẾN',
    durationSeconds: runtimeNodes.reduce(
      (total, node) => total + nodeActualDurationSeconds(node, nowMs),
      0,
    ),
    isRunning: runtimeNodes.some(node => node.status === 'in_progress'),
  };
}
