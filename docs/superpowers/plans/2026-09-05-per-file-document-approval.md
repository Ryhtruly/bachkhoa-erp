# Per-file Document Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giữ file đã đạt trong checklist và Tủ hồ sơ, đồng thời cho phép nhân viên bổ sung nhiều file có lý do và duyệt riêng lượt mới.

**Architecture:** Bổ sung state/audit ở liên kết file của loại giấy; trạng thái loại giấy chỉ tóm tắt lượt hiện tại. Tủ hồ sơ dựng cấu trúc từ mọi loại giấy runtime nhưng chỉ aggregate file `approved` của đúng `contract_id + service_line_id`.

**Tech Stack:** PostgreSQL/Supabase, FastAPI, SQLAlchemy text queries, React 19, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-05-per-file-document-approval-design.md`

## Global Constraints

- Không dùng subagent.
- Không reset hoặc ghi đè thay đổi chưa commit của người dùng.
- Test phải đỏ đúng nguyên nhân trước khi sửa production code.
- File approved không bị xóa, hạ trạng thái hoặc ẩn khi có lượt upload mới.
- Tủ không trả nội dung file draft, pending_review hoặc rejected.
- Chạy impact analysis trước khi sửa symbol và detect changes trước commit nếu công cụ khả dụng.

---

### Task 1: Schema và tương thích rollout

**Files:**
- Create: `supabase/migrations/20260905110000_per_file_document_approval.sql`
- Create: `supabase/migrations/20260905110000_per_file_document_approval_down.sql`
- Modify: `dev/backend/src/employee_portal/service.py`
- Test: `dev/backend/tests/test_checklist_document_types_unittest.py`

- [ ] Viết test đỏ: DB chưa migrate không trả khóa `document_types` rỗng.
- [ ] Viết migration thêm `status`, `change_reason`, `rejection_reason`, `reviewed_by`, `reviewed_at` cho liên kết file và backfill từ loại giấy.
- [ ] Sửa serializer fallback và chạy test xanh.
- [ ] Kiểm tra migration idempotence/preflight trên transaction rollback.

### Task 2: State machine file phía backend

**Files:**
- Modify: `dev/backend/src/dossiers/checklist_document_types.py`
- Modify: `dev/backend/src/routes/routes_employee_portal.py`
- Test: `dev/backend/tests/test_checklist_document_types_unittest.py`
- Test: `dev/backend/tests/test_checklist_document_type_routes.py`

- [ ] Viết test đỏ cho upload loại xanh bắt buộc lý do và giữ file xanh cũ.
- [ ] Viết test đỏ cho submit/review chỉ chuyển file draft/pending của lượt mới.
- [ ] Mở API multipart nhận `change_reason` và trả trạng thái từng file.
- [ ] Chạy toàn bộ test domain/routes liên quan.

### Task 3: Tủ hồ sơ luôn có cấu trúc, chỉ công bố file đạt

**Files:**
- Modify: `dev/backend/src/dossiers/register.py`
- Modify: `dev/backend/tests/test_dossier_documents_unittest.py`
- Modify: `dev/frontend/src/features/employee-portal/NodeDocumentCabinet.jsx`
- Modify: `dev/frontend/src/features/contracts/DocumentCabinet.jsx`
- Test: hai test component tương ứng.

- [ ] Viết test đỏ: loại pending/rejected vẫn hiện nhưng chỉ file approved được trả.
- [ ] Bỏ điều kiện checklist 100% khỏi cấu trúc tủ; aggregate file theo status approved.
- [ ] Cập nhật bộ đếm/copy UI theo “file đã duyệt”.
- [ ] Chạy test backend và frontend tập trung.

### Task 4: Workspace nhân viên và màn duyệt Giám đốc

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/components/contracts/NodeChecklistCard.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Test: các test component tương ứng.

- [ ] Viết test đỏ cho file xanh + file sai cùng loại, lý do và upload lại.
- [ ] Viết test đỏ cho loại xanh yêu cầu lý do trước khi chọn nhiều file.
- [ ] Hiển thị badge từng file; truyền `change_reason` qua FormData.
- [ ] Giữ duyệt cấp loại nhưng action chỉ xử lý file pending.
- [ ] Chạy các test React tập trung và build.

### Task 5: Migration và xác minh tích hợp

**Files:**
- Apply: hai migration runtime theo đúng thứ tự.

- [ ] Chạy preflight/readback schema và backfill trong transaction rollback.
- [ ] Áp migration sau khi preflight đạt.
- [ ] Xác minh task K01 bị trả về hiện lại checklist và lý do.
- [ ] Xác minh tủ của đúng service line có loại giấy, chỉ file approved mở được.
- [ ] Chạy toàn bộ backend/frontend tests liên quan, compile/build và diff check.
- [ ] Chạy detect changes nếu khả dụng, review diff và commit theo phạm vi.
