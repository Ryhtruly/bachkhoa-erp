-- Migration M4: Seed cấu hình tài chính vào finance_settings (Module Kế toán v3.4)
INSERT INTO finance_settings ("key", "value")
VALUES ('expense_approval_threshold', 2000000),
       ('advance_admin_threshold', 5000000)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
