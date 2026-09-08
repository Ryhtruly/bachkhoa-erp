import { describe, expect, it } from 'vitest';
import { getGraphFingerprint } from './workflowDirty';

const originalGraph = {
  start_node: 'k01',
  nodes: {
    k01: { name: 'Tiếp nhận', duration_days: 1, checklist: [], transitions: { COMPLETED: 'k02' } },
    k02: { name: 'Khảo sát', duration_days: 3, checklist: [], transitions: {} },
  },
  ui: { k01: { x: 0, y: 0 }, k02: { x: 260, y: 0 }, edges: {} },
};

const cloneGraph = (source) => JSON.parse(JSON.stringify(source));

describe('getGraphFingerprint — detects unsaved workflow business changes', () => {
  it('dragging nodes does NOT count as a business change', () => {
    const draggedGraph = cloneGraph(originalGraph);
    draggedGraph.ui.k02 = { x: 900, y: 420 };
    draggedGraph.ui.edges = { 'k01:COMPLETED:k02': [{ x: 100, y: 50 }] };

    expect(getGraphFingerprint(draggedGraph)).toBe(getGraphFingerprint(originalGraph));
  });

  it('detaching an edge DOES count as a change', () => {
    const detachedEdgeGraph = cloneGraph(originalGraph);
    detachedEdgeGraph.nodes.k01.transitions = {};

    expect(getGraphFingerprint(detachedEdgeGraph)).not.toBe(getGraphFingerprint(originalGraph));
  });

  it('adding a node DOES count as a change', () => {
    const addedNodeGraph = cloneGraph(originalGraph);
    addedNodeGraph.nodes.k03 = { name: 'Bàn giao', duration_days: 1, checklist: [], transitions: {} };

    expect(getGraphFingerprint(addedNodeGraph)).not.toBe(getGraphFingerprint(originalGraph));
  });

  it('editing step name, duration or checklist DOES count as a change', () => {
    const renamedGraph = cloneGraph(originalGraph);
    renamedGraph.nodes.k01.name = 'Tiếp nhận hồ sơ';
    const changedDurationGraph = cloneGraph(originalGraph);
    changedDurationGraph.nodes.k02.duration_days = 5;
    const changedChecklistGraph = cloneGraph(originalGraph);
    changedChecklistGraph.nodes.k02.checklist = [{ key: 'anh', label: 'Ảnh hiện trạng' }];

    const baseline = getGraphFingerprint(originalGraph);
    expect(getGraphFingerprint(renamedGraph)).not.toBe(baseline);
    expect(getGraphFingerprint(changedDurationGraph)).not.toBe(baseline);
    expect(getGraphFingerprint(changedChecklistGraph)).not.toBe(baseline);
  });

  it('changing start node DOES count as a change', () => {
    const changedStartNodeGraph = cloneGraph(originalGraph);
    changedStartNodeGraph.start_node = 'k02';

    expect(getGraphFingerprint(changedStartNodeGraph)).not.toBe(getGraphFingerprint(originalGraph));
  });

  it('same content with different key order yields identical fingerprint', () => {
    const shuffledKeysGraph = {
      ui: originalGraph.ui,
      nodes: {
        k02: { transitions: {}, checklist: [], duration_days: 3, name: 'Khảo sát' },
        k01: { transitions: { COMPLETED: 'k02' }, checklist: [], duration_days: 1, name: 'Tiếp nhận' },
      },
      start_node: 'k01',
    };

    expect(getGraphFingerprint(shuffledKeysGraph)).toBe(getGraphFingerprint(originalGraph));
  });
});
