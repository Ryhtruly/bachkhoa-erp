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

  const pausedSeconds = Math.max(0, Number(node?.paused_seconds || 0));
  const isCurrentlyPaused = Boolean(node?.pause_reason_type && node?.paused_at);
  const pausedAt = validTimestamp(node?.paused_at);
  const currentPauseDuration = (isCurrentlyPaused && pausedAt !== null && nowMs > pausedAt)
    ? Math.floor((nowMs - pausedAt) / 1000)
    : 0;
  const totalPaused = pausedSeconds + currentPauseDuration;

  const stoppedAt = validTimestamp(
    node?.completed_at || node?.accepted_at || node?.submitted_at,
  );
  if (stoppedAt !== null) {
    return Math.max(0, Math.floor((stoppedAt - startedAt) / 1000) - totalPaused);
  }

  if (node?.status === 'in_progress') {
    return Math.max(0, Math.floor((nowMs - startedAt) / 1000) - totalPaused);
  }

  return 0;
}

export function formatWorkflowDuration(seconds, compact = false) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (compact) {
    if (safe === 0) return '0p';
    if (days > 0) return `${days}d ${hours}h ${minutes}p`;
    if (hours > 0) return `${hours}h ${minutes}p`;
    return `${minutes}p`;
  }

  if (days > 0) {
    return `${days} ngày ${hours} giờ ${minutes} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ ${minutes} phút`;
  }
  return `${minutes} phút`;
}

export function calculateWorkflowProgress(runtimeNodes = [], workflowStatus, nowMs = Date.now()) {
  if (!runtimeNodes.length) return null;

  const finished = runtimeNodes.filter(node => FINISHED_NODE_STATUSES.has(node.status));
  const completed = workflowStatus === 'completed'
    || (runtimeNodes.length > 0 && runtimeNodes.every(node => FINISHED_NODE_STATUSES.has(node.status)));
  const actualEndValues = runtimeNodes.map(
    node => node.completed_at || node.accepted_at || node.submitted_at,
  );
  const plannedEndValues = runtimeNodes.map(node => node.deadline_at);

  const startedAt = earliestValue(runtimeNodes.map(node => node.started_at));
  const endAt = latestValue(completed ? actualEndValues : plannedEndValues);
  const endLabel = completed ? 'KẾT THÚC' : 'HẠN CHÓT';

  const totalDurationSeconds = runtimeNodes.reduce(
    (total, node) => total + nodeActualDurationSeconds(node, nowMs),
    0,
  );

  // Status tone calculation for SLA indicator
  let statusTone = 'on_track';
  let statusLabel = 'ĐÚNG HẠN';
  let statusIcon = '🟢';

  if (completed) {
    statusTone = 'completed';
    statusLabel = 'HOÀN TẤT';
    statusIcon = '🟢';
  } else if (endAt) {
    const endTimestamp = validTimestamp(endAt);
    if (endTimestamp !== null) {
      if (nowMs > endTimestamp) {
        statusTone = 'overdue';
        statusLabel = 'TRỄ HẠN';
        statusIcon = '🔴';
      } else if (endTimestamp - nowMs < 24 * 3600 * 1000) {
        statusTone = 'urgent';
        statusLabel = 'CẦN GẤP';
        statusIcon = '🟡';
      }
    }
  }

  // Node timing breakdown for hover tooltip
  const nodeBreakdown = runtimeNodes.map(node => {
    const durationSeconds = nodeActualDurationSeconds(node, nowMs);
    let durationText = 'Chưa bắt đầu';
    if (durationSeconds > 0) {
      durationText = formatWorkflowDuration(durationSeconds, true);
    } else if (node.status === 'in_progress') {
      durationText = 'Đang làm';
    }

    return {
      key: node.node_key || node.key || node.id,
      code: node.node_code || node.code || 'NODE',
      name: node.name || node.node_name || node.label || 'Bước công việc',
      status: node.status,
      durationSeconds,
      durationText,
      sequenceIndex: node.sequence_index ?? node.sequenceIndex,
    };
  });

  nodeBreakdown.sort((a, b) => {
    if (a.sequenceIndex != null && b.sequenceIndex != null && a.sequenceIndex !== b.sequenceIndex) {
      return a.sequenceIndex - b.sequenceIndex;
    }
    return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
  });

  // Calculate elapsed wall-clock vs actual active work to get waiting / off-hours time
  const startedTimestamp = validTimestamp(startedAt);
  let totalElapsedSeconds = 0;
  if (startedTimestamp !== null) {
    const referenceEndMs = completed
      ? (validTimestamp(endAt) || nowMs)
      : nowMs;
    totalElapsedSeconds = Math.max(0, Math.floor((referenceEndMs - startedTimestamp) / 1000));
  }
  const waitingSeconds = Math.max(0, totalElapsedSeconds - totalDurationSeconds);

  return {
    finished: finished.length,
    total: runtimeNodes.length,
    percent: Math.round((finished.length / runtimeNodes.length) * 100),
    startedAt,
    endAt,
    endLabel,
    durationSeconds: totalDurationSeconds,
    durationFormatted: formatWorkflowDuration(totalDurationSeconds),
    waitingSeconds,
    waitingFormatted: formatWorkflowDuration(waitingSeconds),
    statusTone,
    statusLabel,
    statusIcon,
    nodeBreakdown,
    isRunning: runtimeNodes.some(node => node.status === 'in_progress'),
  };
}
