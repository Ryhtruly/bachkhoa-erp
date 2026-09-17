# Finance Status Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuẩn hóa status của module Kế toán – Tài chính ở backend/DB về các giá trị English canonical mà không làm sai số dư quỹ, công nợ, tạm ứng hoặc hiển thị tiếng Việt trên UI.

**Architecture:** `TransactionStatus` là nguồn canonical cho nghiệp vụ. `normalize_status()` tiếp tục nhận input legacy ở boundary; các alias dùng cho dữ liệu DB cũ được tập trung trong `finance.enums`, thay vì rải literal tiếng Việt trong raw SQL. Migration/backfill chuẩn hóa dữ liệu hiện hữu, còn các label tiếng Việt chỉ nằm ở serializer/presentation.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Supabase, Alembic-style SQL migrations, pytest.

**Spec:** Approved in chat: chỉ áp dụng cho module Kế toán – Tài chính và toàn bộ luồng trực tiếp đọc `cashflow_transactions`/finance statuses.

## Global Constraints

- Canonical transaction statuses: `PENDING`, `COMPLETED`, `REJECTED`, `CANCELLED`, `SETTLED`.
- `COMPLETED` là phiếu đã duyệt/ghi sổ; `SETTLED` là tạm ứng đã quyết toán.
- API có thể đọc legacy input trong giai đoạn chuyển tiếp, nhưng mọi bản ghi mới phải ghi canonical English.
- Tiếng Việt chỉ dùng cho display labels và thông báo người dùng.
- Không thay đổi status của Workflow, Legal, CRM, HR hoặc Payroll ngoài các truy vấn trực tiếp của module Finance.
- Không commit/push trong task này.

---

### Task 1: Canonical enum and regression tests

**Files:**
- Modify: `dev/backend/src/finance/enums.py`
- Test: `dev/backend/tests/test_finance_enums.py`

- [ ] Bổ sung các tuple/set canonical và DB compatibility aliases tập trung.
- [ ] Bảo đảm `SETTLED` không bị gộp vào `COMPLETED`.
- [ ] Viết test chứng minh legacy input normalize đúng và business sets chỉ chứa canonical values.
- [ ] Chạy test enum để xác nhận RED trước khi sửa consumer.

### Task 2: Finance service/repository canonical status reads and writes

**Files:**
- Modify: `dev/backend/src/finance/services.py`
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/backend/src/db/models/finance.py`
- Test: `dev/backend/tests/test_finance.py`
- Test: `dev/backend/tests/test_finance_income_expense_policy.py`
- Test: `dev/backend/tests/test_receivables_voucher_approval.py`

- [ ] Thay các hard-coded status set bằng constants/normalization helper.
- [ ] Chuẩn hóa status trước khi so sánh trong service.
- [ ] Giữ `SETTLED` trong các phép tính số dư phù hợp, không dùng nó như trạng thái approval mới.
- [ ] Bảo đảm các đường tạo mới/approve/reject/void/clear advance chỉ ghi canonical values.
- [ ] Chạy regression finance trước và sau thay đổi.

### Task 3: Raw SQL consumers outside finance package

**Files:**
- Modify: `dev/backend/src/routes/routes_finance.py`
- Modify: `dev/backend/src/routes/routes_dashboard.py`
- Modify: `dev/backend/src/routes/routes_notifications.py`
- Modify: `dev/backend/src/routes/routes_customers.py`
- Modify: `dev/backend/src/routes/routes_contracts.py`
- Modify: `dev/backend/src/dossiers/handover.py`
- Modify: `dev/backend/src/employee_portal/service.py` only where it reads finance status
- Test: related finance/accounting regression tests

- [ ] Loại bỏ literal status tiếng Việt khỏi raw SQL finance filters.
- [ ] Dùng DB alias helper trong giai đoạn chuyển tiếp, hoặc canonical-only khi query đã được backfill.
- [ ] Không thay đổi các status thuộc workflow/legal/dossier khác.

### Task 4: PostgreSQL backfill and schema guard

**Files:**
- Create: `supabase/migrations/20260915000000_standardize_finance_statuses.sql`
- Create: `docs/sql/finance_status_backfill.sql`

- [ ] Map legacy values chính xác, đặc biệt `Đã quyết toán -> SETTLED`.
- [ ] Chuẩn hóa `cashflow_transactions.status`, `transaction_type`, `payment_method`, `scope`, `fund_opening_balances.payment_method` nếu còn legacy.
- [ ] Thêm query kiểm tra các giá trị ngoài whitelist trước/sau backfill.
- [ ] Không tự suy đoán các row đã bị migration cũ chuyển nhầm `Đã quyết toán -> COMPLETED`; cung cấp query review riêng.
- [ ] Chỉ thêm constraint khi không còn giá trị ngoài whitelist.

### Task 5: Verification

- [ ] Chạy `git diff --check`.
- [ ] Chạy `py_compile` các file backend đã sửa.
- [ ] Chạy toàn bộ finance/accounting/payroll regression trên PostgreSQL disposable.
- [ ] Nếu PostgreSQL disposable được tạo, xác nhận đúng target rồi dọn container/volume.
- [ ] Chạy GitNexus `detect_changes()` trước commit nếu task được commit sau này; task hiện tại không commit/push.

