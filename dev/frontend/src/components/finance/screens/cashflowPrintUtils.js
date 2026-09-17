const COUNTED_TRANSACTION_STATUSES = new Set([
  'completed',
  'hoàn thành',
  'đã duyệt',
  'approved',
  'đã quyết toán',
]);

const VOUCHER_PRINT_STATUS = {
  PENDING: {
    key: 'PENDING',
    label: 'CHỜ DUYỆT',
    title: 'BẢN DỰ THẢO - CHỜ DUYỆT',
    message: 'Chưa có giá trị ghi sổ và chưa phải chứng từ chính thức.',
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'TỪ CHỐI',
    title: 'BẢN LƯU - CHỨNG TỪ BỊ TỪ CHỐI',
    message: 'Không có giá trị ghi sổ và không phát sinh thu chi trên sổ quỹ.',
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'ĐÃ HỦY',
    title: 'BẢN LƯU - CHỨNG TỪ ĐÃ HỦY',
    message: 'Không có giá trị ghi sổ và số tiền không tính vào sổ quỹ.',
  },
};

const PRINT_STATUS_ALIASES = {
  pending: 'PENDING',
  'chờ duyệt': 'PENDING',
  rejected: 'REJECTED',
  'từ chối': 'REJECTED',
  cancelled: 'CANCELLED',
  'đã hủy': 'CANCELLED',
};

export const getVoucherPrintStatus = (status) => {
  const key = PRINT_STATUS_ALIASES[String(status || '').trim().toLowerCase()] || String(status || '').trim().toUpperCase();
  return VOUCHER_PRINT_STATUS[key] || null;
};

export const isCountedTransaction = (transaction) => {
  const rawStatus = transaction?.status;
  if (rawStatus === null || rawStatus === undefined || String(rawStatus).trim() === '') {
    return true;
  }
  return COUNTED_TRANSACTION_STATUSES.has(String(rawStatus).trim().toLowerCase());
};

export const getPrintableTransactions = (transactions) => (
  Array.isArray(transactions) ? transactions.filter(isCountedTransaction) : []
);
