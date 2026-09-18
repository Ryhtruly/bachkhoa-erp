import { describe, expect, it } from 'vitest';
import { getVoucherPrintStatus } from './cashflowPrintUtils';

describe('voucher print status metadata', () => {
  it('marks rejected and cancelled vouchers as archived non-posting documents', () => {
    expect(getVoucherPrintStatus('REJECTED')).toMatchObject({ key: 'REJECTED', label: 'TỪ CHỐI' });
    expect(getVoucherPrintStatus('Đã hủy')).toMatchObject({ key: 'CANCELLED', label: 'ĐÃ HỦY' });
  });

  it('does not mark completed vouchers as archived', () => {
    expect(getVoucherPrintStatus('COMPLETED')).toBeNull();
  });

  it('marks pending vouchers as draft documents without posting value', () => {
    expect(getVoucherPrintStatus('PENDING')).toMatchObject({
      key: 'PENDING',
      label: 'CHỜ DUYỆT',
    });
  });
});
