import { describe, expect, it } from 'vitest';
import { getTimeBasedGreeting } from './greeting';

describe('getTimeBasedGreeting', () => {
  it('returns "Chào buổi sáng" between 05:00 and 10:59', () => {
    expect(getTimeBasedGreeting(5)).toBe('Chào buổi sáng');
    expect(getTimeBasedGreeting(8)).toBe('Chào buổi sáng');
    expect(getTimeBasedGreeting(10)).toBe('Chào buổi sáng');

    const morningDate = new Date('2026-09-22T08:30:00');
    expect(getTimeBasedGreeting(morningDate)).toBe('Chào buổi sáng');
  });

  it('returns "Chào buổi trưa" between 11:00 and 13:59', () => {
    expect(getTimeBasedGreeting(11)).toBe('Chào buổi trưa');
    expect(getTimeBasedGreeting(12)).toBe('Chào buổi trưa');
    expect(getTimeBasedGreeting(13)).toBe('Chào buổi trưa');

    const noonDate = new Date('2026-09-22T12:15:00');
    expect(getTimeBasedGreeting(noonDate)).toBe('Chào buổi trưa');
  });

  it('returns "Chào buổi chiều" between 14:00 and 17:59', () => {
    expect(getTimeBasedGreeting(14)).toBe('Chào buổi chiều');
    expect(getTimeBasedGreeting(16)).toBe('Chào buổi chiều');
    expect(getTimeBasedGreeting(17)).toBe('Chào buổi chiều');

    const afternoonDate = new Date('2026-09-22T15:45:00');
    expect(getTimeBasedGreeting(afternoonDate)).toBe('Chào buổi chiều');
  });

  it('returns "Chào buổi tối" from 18:00 through midnight to 04:59', () => {
    expect(getTimeBasedGreeting(18)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(20)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(22)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(23)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(0)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(2)).toBe('Chào buổi tối');
    expect(getTimeBasedGreeting(4)).toBe('Chào buổi tối');

    const nightDate = new Date('2026-09-22T22:30:00');
    expect(getTimeBasedGreeting(nightDate)).toBe('Chào buổi tối');
  });

  it('defaults to current time without arguments', () => {
    const greeting = getTimeBasedGreeting();
    expect(typeof greeting).toBe('string');
    expect(['Chào buổi sáng', 'Chào buổi trưa', 'Chào buổi chiều', 'Chào buổi tối']).toContain(greeting);
  });
});
