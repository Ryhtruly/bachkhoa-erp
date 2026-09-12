# Role Canonicalization and Vietnamese Identifier Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Track each task with checkbox syntax.

**Goal:** Chuẩn hóa role trong hệ thống và đổi các function/parameter/biến nội bộ tiếng Việt hoặc transliterated tiếng Việt sang tên tiếng Anh rõ nghĩa, không làm thay đổi nghiệp vụ payroll, API contract hoặc dữ liệu lịch sử.

**Current status:** Chưa bắt đầu sửa code. Đã kiểm kê read-only. Worktree đang có các thay đổi accounting hardening hiện hữu; phải bảo toàn các thay đổi đó.

**Open policy decision:** Code hiện dùng `employee` làm role mặc định, nhưng migration RBAC canonical không seed role này. Trước Task 2 phải chốt một trong hai phương án:

- **Option A (recommended):** bỏ `employee`; tài khoản mới phải nhận role nghiệp vụ cụ thể: `sales`, `survey_staff`, `legal_staff`, `accountant` hoặc `admin`.
- **Option B:** giữ `employee` là role generic; bổ sung seed, permission, scope và test cho role này.

## Canonical role policy

- `admin` là role của giám đốc/chủ doanh nghiệp và technical superuser theo migration RBAC hiện tại.
- `accountant` là role kế toán.
- `sales`, `survey_staff`, `legal_staff` là các role nghiệp vụ nhân viên.
- Nhân viên chỉ xem payroll của bản thân; chỉ `admin` và `accountant` xem toàn bộ payroll.
- Alias cần migrate và loại bỏ khỏi runtime allowlist:
  - `director`, `giam_doc`, `giám đốc` → `admin`.
  - `kế toán`, `ke_toan` → `accountant`.
- Giữ nguyên API/database contract như `is_director`, `role_name`, `director_name`, `approver_role`; đây là tên field/contract, không phải identifier nội bộ cần đổi.
- Không sửa migration lịch sử hoặc audit reason đã persisted; chỉ thêm forward migration.

## Global constraints

- Không reset, revert, commit hoặc push thay đổi hiện hữu.
- Không rename file backup lịch sử hoặc code không được import vào runtime nếu không có lý do tương thích rõ ràng.
- Không đổi text tiếng Việt hiển thị cho người dùng, comment nghiệp vụ hoặc tên cột/bảng SQL chỉ vì mục tiêu ngôn ngữ.
- Mỗi symbol trước khi sửa phải được chạy GitNexus `impact(..., direction: "upstream")`; với risk `HIGH`/`CRITICAL` phải review caller và test trước khi tiếp tục.
- Function/class/method rename phải dùng GitNexus `rename` preview, review kết quả graph/text-search, rồi mới áp dụng; không dùng find-and-replace mù.
- Chạy `detect_changes()` sau khi hoàn tất thay đổi để xác minh scope; không commit trong task này nếu chưa được yêu cầu.

---

### Task 1: Freeze inventory and classify identifiers

**Files:**
- Inspect: `dev/backend/src/**/*.py`, `dev/backend/tests/**/*.py`, `dev/frontend/src/**/*.{js,jsx,ts,tsx}`
- Inspect: `dev/backend/src/core/auth.py`, `dev/backend/src/dossiers/actor_guard.py`, `dev/backend/src/routes/routes_user_admin.py`, `dev/backend/src/user_admin/service.py`

**Implementation:**
- Tạo inventory có phân loại: function/class/method, parameter/local variable, SQL bind key/alias, public schema/route field, UI copy, backup code.
- Chỉ đưa identifier nội bộ vào rename set.
- Đặc biệt review các tên transliterated hiện đã phát hiện trong `dossiers`, `contracts/workflow_runtime.py`, `routes_slot_requests.py` và test fixtures.
- Không đổi `is_director` ở API/profile contract dù bên trong có thể dùng helper tên khác.

**Verification:**
- AST/token scan không còn Unicode identifier trong live source.
- Báo cáo còn lại chỉ gồm public contract, SQL/database names, UI text, comments hoặc backup/historical files.

### Task 2: Normalize persisted roles and enforce canonical roles

**Files:**
- Create: `supabase/migrations/<timestamp>_canonicalize_rbac_roles.sql`
- Modify: `dev/backend/src/core/auth.py`
- Modify: `dev/backend/src/finance/access.py`
- Modify: `dev/backend/src/dossiers/actor_guard.py`
- Modify: `dev/backend/src/user_admin/service.py`
- Modify: `dev/backend/src/routes/routes_user_admin.py`
- Inspect/modify only if required: other role assignment routes and RBAC migrations

**Implementation:**
- Viết migration idempotent kiểm tra role alias, map alias về canonical role, gộp duplicate `user_roles`, giữ canonical permissions/scope và đánh dấu alias inactive hoặc loại bỏ theo constraint hiện hữu.
- Không xóa role row đang được tham chiếu trước khi xử lý `user_roles`.
- Runtime allowlist chỉ còn canonical role names.
- Chặn tạo/gán alias mới ở server boundary.
- Xử lý decision `employee` theo Option A hoặc B; không để `DEFAULT_ACCOUNT_ROLE` trỏ tới role không được seed.
- Đồng bộ `is_director` và các route yêu cầu giám đốc về `admin` canonical, vẫn giữ username technical bypass hiện tại nếu policy yêu cầu.

**Tests first:**
- Alias user được chuẩn hóa đúng sau migration.
- Alias không còn được dùng để bypass authorization.
- `admin` và `accountant` xem được toàn bộ payroll.
- `sales`, `survey_staff`, `legal_staff` chỉ xem được payroll của chính mình.
- Tạo tài khoản mới dùng đúng policy `employee` đã chốt.
- Duplicate user-role không làm mất permission canonical.

**Verification:**
- PostgreSQL disposable `bachkhoa_test` migration/schema test.
- Backend RBAC, payroll access và user-admin tests.

### Task 3: Rename internal backend identifiers safely

**Files:**
- Modify only the files selected by Task 1 inventory, primarily:
  - `dev/backend/src/routes/routes_slot_requests.py`
  - `dev/backend/src/contracts/workflow_runtime.py`
  - `dev/backend/src/dossiers/slot_requests.py`
  - `dev/backend/src/dossiers/register.py`
  - `dev/backend/src/dossiers/documents.py`
  - related backend tests/fixtures

**Implementation:**
- Đổi tên theo nhóm nhỏ, mỗi symbol một lần qua GitNexus `impact` → `rename` preview → apply.
- Quy ước tên tiếng Anh nhất quán: `ket_qua` → `result`, `ly_do` → `reason`, `trang_thai` → `status`, `pham_vi` → `scope`, `la_giam_doc` → `is_director` nếu chỉ là local boolean.
- Với SQL bind params/aliases, chỉ đổi nếu toàn bộ query và mapping cùng được cập nhật; không đổi tên cột/bảng.
- Với test function/fixture, đổi tên để test discovery và failure output dễ đọc hơn, nhưng giữ nguyên hành vi test.
- Không rename public route handler parameter nếu FastAPI/OpenAPI hoặc frontend phụ thuộc tên đó; nếu cần đổi phải có compatibility alias và test contract.

**Verification after each group:**
- `python -m compileall -q src`
- Targeted pytest for the touched module.
- `git diff --check`.
- GitNexus context/impact spot-check for high fan-out symbols.

### Task 4: Align frontend only where internal names are affected

**Files:**
- Modify only frontend consumers proven by route/shape search.

**Implementation:**
- Giữ nguyên response fields, route paths và user-facing Vietnamese labels.
- Chỉ đổi local JS variable/function names nếu chúng thuộc rename inventory và không tạo breaking contract.
- Không đổi `isDirector`/`is_director` contract trong một refactor nội bộ.

**Verification:**
- Frontend tests, lint và build.
- Route/shape check cho các endpoint payroll/auth.

### Task 5: Security review and regression verification

**Checks:**
- Run full relevant backend unit tests and PostgreSQL integration tests against disposable `bachkhoa_test`.
- Run frontend test/lint/build.
- Run AST scan for Vietnamese identifiers and role-alias scan over live source/migrations.
- Run Codex Security standard scan on the changed repository scope after implementation; manually review any finding touching authorization or payroll data.
- Run GitNexus `detect_changes()` and compare affected flows against the expected rename/role scope.
- Inspect `git diff --stat`, `git diff --check`, and `git status --short`; ensure existing accounting hardening changes are preserved and no unrelated generated files are included.

## Completion criteria

- No runtime authorization allowlist accepts the removed role aliases.
- Existing alias users have a deterministic, idempotent migration path to canonical roles.
- `employee` default is resolved according to the approved option.
- No internal Vietnamese/transliterated identifier remains in the selected live source/test scope, except intentionally preserved public contracts or SQL/database names.
- Payroll visibility rules remain correct and are covered by passing tests.
- All verification commands and any environment limitations are reported; no commit/push is performed unless explicitly requested.
