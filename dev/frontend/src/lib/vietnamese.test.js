import { describe, expect, it } from 'vitest';
import { normalizeVietnamese } from './vietnamese';

describe('normalizeVietnamese', () => {
  it('handles null, undefined, or empty strings gracefully', () => {
    expect(normalizeVietnamese(null)).toBe('');
    expect(normalizeVietnamese(undefined)).toBe('');
    expect(normalizeVietnamese('')).toBe('');
  });

  it('normalizes vowels with single and compound accents', () => {
    expect(normalizeVietnamese('Nguyễn')).toBe('nguyen');
    expect(normalizeVietnamese('Đoàn')).toBe('doan');
    expect(normalizeVietnamese('KỸ THUẬT')).toBe('ky thuat');
    expect(normalizeVietnamese('Trần Thị Ánh Hướng')).toBe('tran thi anh huong');
  });

  it('handles both uppercase and lowercase đ / Đ', () => {
    expect(normalizeVietnamese('Điều phối & Đào tạo')).toBe('dieu phoi & dao tao');
    expect(normalizeVietnamese('đại diện')).toBe('dai dien');
  });

  it('preserves numbers and symbols', () => {
    expect(normalizeVietnamese('Phòng 01 - KT&CN')).toBe('phong 01 - kt&cn');
  });

  it('allows accent-insensitive matching via includes()', () => {
    const haystacks = ['Nguyễn Văn An', 'Đặng Thùy Dương', 'Võ Thị Sáu'];
    const query1 = normalizeVietnamese('nguyen');
    const query2 = normalizeVietnamese('thuy');
    const query3 = normalizeVietnamese('dang');

    expect(haystacks.some(h => normalizeVietnamese(h).includes(query1))).toBe(true);
    expect(haystacks.some(h => normalizeVietnamese(h).includes(query2))).toBe(true);
    expect(haystacks.some(h => normalizeVietnamese(h).includes(query3))).toBe(true);
  });
});
