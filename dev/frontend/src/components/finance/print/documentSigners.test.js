import { describe, expect, it } from 'vitest';
import { resolveSignerEntries } from './documentSigners';

describe('document signer configuration', () => {
  it('maps configured names to report roles without inventing missing accountant names', () => {
    const result = resolveSignerEntries([
      { role: 'Người lập biểu', note: '(Ký, họ tên)' },
      { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
      { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
    ], {
      director_name: 'Lê Văn Sáu',
      accountant_name: '',
      accountant_role: 'Kế toán trưởng',
      creator_name: 'Nguyễn Văn A',
    });

    expect(result.map(signer => signer.name)).toEqual([
      'Nguyễn Văn A',
      undefined,
      'Lê Văn Sáu',
    ]);
  });

  it('keeps transaction-specific people separate from configured company signers', () => {
    const result = resolveSignerEntries([
      { role: 'Người nhận lương', note: '(Ký, ghi rõ họ tên)' },
      { role: 'Kế toán tiền lương', note: '(Ký, họ tên)' },
    ], {
      payroll_accountant_name: 'Kế toán B',
      accountant_name: 'Kế toán trưởng A',
    });

    expect(result.map(signer => signer.name)).toEqual([
      undefined,
      'Kế toán B',
    ]);
  });

  it('uses the configured accountant title on report signatures', () => {
    const result = resolveSignerEntries([
      { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
    ], {
      accountant_role: 'Kế toán phụ trách',
      accountant_name: 'Kế toán B',
    });

    expect(result[0]).toMatchObject({
      role: 'Kế toán phụ trách',
      name: 'Kế toán B',
    });
  });

  it('can render a persisted historical snapshot without using current settings', () => {
    const historicalSnapshot = {
      director_name: 'Lê Văn Sáu',
      accountant_name: 'Nguyễn Kế Toán Cũ',
      accountant_role: 'Kế toán trưởng',
      captured_at: '2026-08-23T10:30:00+00:00',
      captured_by: 'director-user',
    };

    const result = resolveSignerEntries([
      { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
      { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
    ], historicalSnapshot);

    expect(result.map(signer => signer.name)).toEqual([
      'Nguyễn Kế Toán Cũ',
      'Lê Văn Sáu',
    ]);
  });
});
