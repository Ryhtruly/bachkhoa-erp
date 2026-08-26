import { describe, expect, it } from 'vitest';

import {
  calculateWorkflowProgress,
  formatWorkflowDuration,
} from './workflowProgress';

describe('workflowProgress', () => {
  it('formats the cumulative duration with explicit Vietnamese units', () => {
    expect(formatWorkflowDuration(0)).toBe('0 ngày 0 giờ 0 phút');
    expect(formatWorkflowDuration(90060)).toBe('1 ngày 1 giờ 1 phút');
  });

  it('adds persisted durations and the currently running node without counting pending work', () => {
    const now = Date.parse('2026-08-22T12:15:00.000Z');
    const result = calculateWorkflowProgress([
      {
        status: 'accepted',
        started_at: '2026-08-20T08:00:00.000Z',
        completed_at: '2026-08-20T10:00:00.000Z',
        execution_data: { actual_duration_seconds: 3600 },
      },
      {
        status: 'accepted',
        started_at: '2026-08-21T08:00:00.000Z',
        completed_at: '2026-08-21T10:30:00.000Z',
      },
      {
        status: 'in_progress',
        started_at: '2026-08-22T11:00:00.000Z',
      },
      { status: 'ready', deadline_at: '2026-08-30T17:00:00.000Z' },
    ], 'active', now);

    expect(result.durationSeconds).toBe(3600 + 9000 + 4500);
    expect(result.isRunning).toBe(true);
  });

  it('uses the planned deadline while running and the real completion time once completed', () => {
    const nodes = [
      {
        status: 'accepted',
        completed_at: '2026-08-21T10:00:00.000Z',
        deadline_at: '2026-08-25T17:00:00.000Z',
      },
      {
        status: 'ready',
        deadline_at: '2026-08-30T17:00:00.000Z',
        completed_at: '2026-08-29T09:00:00.000Z',
      },
    ];

    const active = calculateWorkflowProgress(nodes, 'active');
    expect(active.endLabel).toBe('KẾT THÚC DỰ KIẾN');
    expect(active.endAt).toBe('2026-08-30T17:00:00.000Z');

    const completed = calculateWorkflowProgress(nodes, 'completed');
    expect(completed.endLabel).toBe('KẾT THÚC');
    expect(completed.endAt).toBe('2026-08-29T09:00:00.000Z');
  });
});
