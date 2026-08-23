const COUNTED_TRANSACTION_STATUSES = new Set([
  'completed',
  'hoàn thành',
  'đã duyệt',
  'approved',
  'đã quyết toán',
]);

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
