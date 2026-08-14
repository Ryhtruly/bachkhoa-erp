-- Migration M1: Bổ sung các trường phục vụ 6 trạng thái công nợ (Module Kế toán v3.4)
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS refund_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_written_off BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS written_off_reason TEXT,
  ADD COLUMN IF NOT EXISTS written_off_by VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carried_forward_to VARCHAR REFERENCES contracts(id),
  ADD COLUMN IF NOT EXISTS carried_forward_from VARCHAR REFERENCES contracts(id);

COMMENT ON COLUMN receivables.is_written_off IS 'Giám đốc quyết định xóa nợ/miễn giảm';
COMMENT ON COLUMN receivables.carried_forward_to IS 'Nợ HĐ này đã chuyển sang HĐ khác';
COMMENT ON COLUMN receivables.carried_forward_from IS 'Nợ nhận từ HĐ cũ chuyển sang';
COMMENT ON COLUMN receivables.is_refunded IS 'Hợp đồng hủy hoặc hoàn cọc';
