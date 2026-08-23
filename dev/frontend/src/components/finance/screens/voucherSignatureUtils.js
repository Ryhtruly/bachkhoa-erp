const SIGNATURE_NOTE = '(Ký, họ tên)';

export const getVoucherSignatureRoles = ({
  isReceiptVoucher = false,
  isBankTransfer = false,
  isAdvanceDocument = null,
  labelPerson = '',
  personName = '',
  creatorName = '',
  signerNames = {},
} = {}) => {
  const counterpartyTitle = labelPerson || (isReceiptVoucher ? 'Người nộp tiền' : 'Người nhận tiền');
  const accountantTitle = signerNames.accountant_role || 'Kế toán trưởng';
  const commonRoles = [
    { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)', name: signerNames.director_name || undefined },
    { title: accountantTitle, note: SIGNATURE_NOTE, name: signerNames.accountant_name || undefined },
    { title: 'Người lập phiếu', note: SIGNATURE_NOTE, name: creatorName || signerNames.creator_name || undefined },
    { title: counterpartyTitle, note: SIGNATURE_NOTE, name: personName || undefined },
  ];

  if (isAdvanceDocument || isBankTransfer) {
    return commonRoles;
  }

  return [
    commonRoles[0],
    commonRoles[1],
    { title: 'Thủ quỹ', note: SIGNATURE_NOTE, name: signerNames.cashier_name || undefined },
    commonRoles[2],
    commonRoles[3],
  ];
};
