-- Migration M3: Thêm tracking Giám đốc chốt bảng lương (Module Kế toán v3.4)
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS locked_by_user_id VARCHAR REFERENCES users(id);

COMMENT ON COLUMN payroll_periods.locked_by_user_id IS 'ID Giám đốc duyệt chốt lương tháng';
