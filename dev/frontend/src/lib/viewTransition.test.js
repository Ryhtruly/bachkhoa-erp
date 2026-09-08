import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeViewTransition } from './viewTransition';

describe('safeViewTransition', () => {
  it('calls updateCallback directly if document.startViewTransition is undefined', () => {
    const callback = vi.fn();
    safeViewTransition(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('delegates to document.startViewTransition if supported', () => {
    const original = document.startViewTransition;
    const mockTransition = vi.fn((fn) => fn());
    document.startViewTransition = mockTransition;

    const callback = vi.fn();
    safeViewTransition(callback);

    expect(mockTransition).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    document.startViewTransition = original;
  });
});

