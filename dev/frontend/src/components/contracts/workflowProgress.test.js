import { describe, expect, it } from 'vitest';

import {
  calculateWorkflowProgress,
  formatWorkflowDuration,
  nodeActualDurationSeconds,
} from './workflowProgress';

describe('workflowProgress', () => {
  it('formats the cumulative duration with streamlined Vietnamese units', () => {
    expect(formatWorkflowDuration(0)).toBe('0 phút');
    expect(formatWorkflowDuration(120)).toBe('2 phút');
    expect(formatWorkflowDuration(8640)).toBe('2 giờ 24 phút');
    expect(formatWorkflowDuration(90060)).toBe('1 ngày 1 giờ 1 phút');

    expect(formatWorkflowDuration(0, true)).toBe('0p');
    expect(formatWorkflowDuration(60, true)).toBe('1p');
    expect(formatWorkflowDuration(5654, true)).toBe('1h 34p');
    expect(formatWorkflowDuration(90060, true)).toBe('1d 1h 1p');
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
    expect(result.nodeBreakdown).toHaveLength(4);
    expect(result.waitingSeconds).toBeGreaterThan(0);
  });

  it('uses HẠN CHÓT while running and KẾT THÚC once completed, with appropriate SLA tone', () => {
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

    const active = calculateWorkflowProgress(nodes, 'active', Date.parse('2026-08-22T10:00:00.000Z'));
    expect(active.endLabel).toBe('HẠN CHÓT');
    expect(active.endAt).toBe('2026-08-30T17:00:00.000Z');
    expect(active.statusTone).toBe('on_track');

    const completed = calculateWorkflowProgress(nodes, 'completed');
    expect(completed.endLabel).toBe('KẾT THÚC');
    expect(completed.endAt).toBe('2026-08-29T09:00:00.000Z');
    expect(completed.statusTone).toBe('completed');
  });

  it('subtracts paused_seconds and active pause duration from actual duration', () => {
    // 1. Node completed with 30 days (2592000s) paused_seconds, total span 2599200s (30 days + 2 hours)
    const nodeWithPausedSeconds = {
      status: 'accepted',
      started_at: '2026-08-01T08:00:00.000Z',
      completed_at: '2026-08-31T10:00:00.000Z', // 30 days + 2 hours = 2,599,200s
      paused_seconds: 2592000, // 30 days paused
    };
    expect(nodeActualDurationSeconds(nodeWithPausedSeconds)).toBe(7200); // exactly 2 hours (7200s)

    // 2. Node in_progress and actively paused
    const startedAt = '2026-09-01T08:00:00.000Z';
    const pausedAt = '2026-09-01T10:00:00.000Z'; // worked 2h (7200s), then paused
    const now = Date.parse('2026-09-03T10:00:00.000Z'); // 2 days later, still paused
    const activelyPausedNode = {
      status: 'in_progress',
      started_at: startedAt,
      paused_at: pausedAt,
      pause_reason_type: 'AGENCY',
      paused_seconds: 0,
    };
    expect(nodeActualDurationSeconds(activelyPausedNode, now)).toBe(7200);
  });

  it('orders nodeBreakdown chronologically by sequenceIndex or alphanumeric code', () => {
    const scrambled = [
      { node_code: 'K03', name: 'Đo đạc', sequence_index: 2 },
      { node_code: 'K07', name: 'Bàn giao', sequence_index: 6 },
      { node_code: 'K01', name: 'Cắm mốc', sequence_index: 0 },
      { node_code: 'K05a', name: 'Thẩm định', sequence_index: 4 },
      { node_code: 'K02', name: 'Trích lục', sequence_index: 1 },
      { node_code: 'K06', name: 'Ký duyệt', sequence_index: 5 },
      { node_code: 'K04', name: 'Nội nghiệp', sequence_index: 3 },
    ];

    const result = calculateWorkflowProgress(scrambled, 'in_progress');
    const codes = result.nodeBreakdown.map(n => n.code);
    expect(codes).toEqual(['K01', 'K02', 'K03', 'K04', 'K05a', 'K06', 'K07']);
    expect(result.nodeBreakdown[0].name).toBe('Cắm mốc');
  });
});
