import { describe, expect, it } from 'vitest';
import { getVoucherSignatureRoles } from './voucherSignatureUtils';

describe('voucher signature roles', () => {
  it('keeps five signature positions for cash receipts and payments', () => {
    expect(getVoucherSignatureRoles({
      isReceiptVoucher: true,
      isBankTransfer: false,
      labelPerson: 'Người nộp tiền',
    }).map(role => role.title)).toEqual([
      'Giám đốc',
      'Kế toán trưởng',
      'Thủ quỹ',
      'Người lập phiếu',
      'Người nộp tiền',
    ]);
  });

  it('removes the cashier position for bank transfers', () => {
    expect(getVoucherSignatureRoles({
      isReceiptVoucher: false,
      isBankTransfer: true,
      labelPerson: 'Người nhận tiền',
    }).map(role => role.title)).toEqual([
      'Giám đốc',
      'Kế toán trưởng',
      'Người lập phiếu',
      'Người nhận tiền',
    ]);
  });

  it('uses four positions for advance and reimbursement documents', () => {
    for (const documentType of ['advance', 'reimbursement']) {
      expect(getVoucherSignatureRoles({
        isReceiptVoucher: false,
        isBankTransfer: false,
        isAdvanceDocument: documentType,
        labelPerson: documentType === 'advance' ? 'Người nhận tạm ứng' : 'Người quyết toán',
      }).map(role => role.title)).toEqual([
        'Giám đốc',
        'Kế toán trưởng',
        'Người lập phiếu',
        documentType === 'advance' ? 'Người nhận tạm ứng' : 'Người quyết toán',
      ]);
    }
  });

  it('keeps configured signer names separate from the transaction counterparty', () => {
    const roles = getVoucherSignatureRoles({
      isReceiptVoucher: true,
      labelPerson: 'Người nộp tiền',
      personName: 'Khách hàng A',
      signerNames: {
        director_name: 'Lê Văn Sáu',
        accountant_name: '',
        creator_name: 'Nguyễn Văn A',
      },
    });

    expect(roles.map(role => role.name)).toEqual([
      'Lê Văn Sáu',
      undefined,
      undefined,
      'Nguyễn Văn A',
      'Khách hàng A',
    ]);
  });

  it('prefers the actual voucher creator over the configured report creator', () => {
    const roles = getVoucherSignatureRoles({
      isReceiptVoucher: false,
      isBankTransfer: true,
      labelPerson: 'Người nhận tiền',
      creatorName: 'Người tạo thực tế',
      signerNames: { creator_name: 'Tên cấu hình cũ' },
    });

    expect(roles.find(role => role.title === 'Người lập phiếu').name).toBe('Người tạo thực tế');
  });
});
