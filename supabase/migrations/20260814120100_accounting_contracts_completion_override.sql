-- Migration M2: Bổ sung fields hoàn thành ngoại lệ do Giám đốc duyệt (Module Kế toán v3.4)
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS completion_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completion_override_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS completion_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS completion_override_at TIMESTAMPTZ;

COMMENT ON COLUMN contracts.completion_override IS 'Giám đốc duyệt cho nợ bàn giao & hoàn tất HĐ';
