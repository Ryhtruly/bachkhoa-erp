import { describe, expect, it } from 'vitest';
import { createChecklistDefinition, removeChecklistDefinition } from './workflowChecklistState';

describe('workflow checklist state', () => {
  it('uses stable unique keys for newly added rows', () => {
    const first = createChecklistDefinition(1, () => 'first');
    const second = createChecklistDefinition(1, () => 'second');
    expect(first.key).toBe('item_first');
    expect(second.key).toBe('item_second');
  });

  it('removes a row before it has been persisted', () => {
    const items = [
      createChecklistDefinition(1, () => 'first'),
      createChecklistDefinition(2, () => 'second'),
    ];
    expect(removeChecklistDefinition(items, 0).map(item => item.key)).toEqual(['item_second']);
  });

  it('removes a row after the graph has been serialized and loaded again', () => {
    const persistedItems = JSON.parse(JSON.stringify([
      createChecklistDefinition(1, () => 'persisted'),
    ]));
    expect(removeChecklistDefinition(persistedItems, 0)).toEqual([]);
  });
});
