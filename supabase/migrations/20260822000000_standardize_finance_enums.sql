-- Migration: Standardize Finance Enums to Canonical English
-- Scope: Module Kế toán tài chính (cashflow_transactions, fund_opening_balances)

-- 1. Standardize cashflow_transactions.transaction_type
UPDATE cashflow_transactions
SET transaction_type = CASE
  WHEN transaction_type IN ('Thu', 'thu', 'INCOME') THEN 'INCOME'
  WHEN transaction_type IN ('Chi', 'chi', 'EXPENSE') THEN 'EXPENSE'
  WHEN transaction_type IN ('Tạm ứng', 'tam_ung', 'ADVANCE') THEN 'ADVANCE'
  WHEN transaction_type IN ('Hoàn ứng', 'hoan_ung', 'REIMBURSEMENT', 'ADVANCE_CLEAR') THEN 'REIMBURSEMENT'
  ELSE transaction_type
END
WHERE transaction_type IS NOT NULL;

-- 2. Standardize cashflow_transactions.status
UPDATE cashflow_transactions
SET status = CASE
  WHEN status IN ('Hoàn thành', 'Đã duyệt', 'approved', 'COMPLETED', 'Đã quyết toán') THEN 'COMPLETED'
  WHEN status IN ('Chờ duyệt', 'pending', 'PENDING') THEN 'PENDING'
  WHEN status IN ('Từ chối', 'rejected', 'REJECTED') THEN 'REJECTED'
  WHEN status IN ('Đã hủy', 'cancelled', 'CANCELLED') THEN 'CANCELLED'
  ELSE status
END
WHERE status IS NOT NULL;

-- 3. Standardize cashflow_transactions.payment_method
UPDATE cashflow_transactions
SET payment_method = CASE
  WHEN payment_method IN ('Tiền mặt', 'tien_mat', 'CASH') THEN 'CASH'
  WHEN payment_method IN ('Chuyển khoản', 'chuyen_khoan', 'BANK_TRANSFER', 'BANK') THEN 'BANK_TRANSFER'
  ELSE payment_method
END
WHERE payment_method IS NOT NULL;

-- 4. Standardize cashflow_transactions.scope
UPDATE cashflow_transactions
SET scope = CASE
  WHEN scope IN ('Công ty', 'cong_ty', 'COMPANY') THEN 'COMPANY'
  WHEN scope IN ('Nội bộ', 'noi_bo', 'INTERNAL') THEN 'INTERNAL'
  ELSE scope
END
WHERE scope IS NOT NULL;

-- 5. Standardize fund_opening_balances.payment_method
UPDATE fund_opening_balances
SET payment_method = CASE
  WHEN payment_method IN ('Tiền mặt', 'tien_mat', 'CASH') THEN 'CASH'
  WHEN payment_method IN ('Chuyển khoản', 'chuyen_khoan', 'BANK_TRANSFER', 'BANK') THEN 'BANK_TRANSFER'
  ELSE payment_method
END
WHERE payment_method IS NOT NULL;

-- Set default values for future records
ALTER TABLE cashflow_transactions 
  ALTER COLUMN scope SET DEFAULT 'COMPANY',
  ALTER COLUMN status SET DEFAULT 'PENDING';

COMMENT ON COLUMN cashflow_transactions.transaction_type IS 'Canonical enum: INCOME, EXPENSE, ADVANCE, REIMBURSEMENT';
COMMENT ON COLUMN cashflow_transactions.status IS 'Canonical enum: COMPLETED, PENDING, REJECTED, CANCELLED';
COMMENT ON COLUMN cashflow_transactions.payment_method IS 'Canonical enum: CASH, BANK_TRANSFER';
COMMENT ON COLUMN cashflow_transactions.scope IS 'Canonical enum: COMPANY, INTERNAL';
