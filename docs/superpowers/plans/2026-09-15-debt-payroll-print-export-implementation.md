# Công nợ và Lương — In/Xuất file Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện khả năng in và xuất file cho các màn Công nợ, Tạm ứng, Quyết toán hoàn ứng và Lương; nội dung in phải phản ánh đúng bộ lọc, trạng thái nghiệp vụ và phạm vi dữ liệu của người dùng.

**Architecture:** Tái sử dụng `FinancePrintReport` và các helper tải blob hiện có ở frontend. Backend bổ sung các hàm tạo workbook riêng cho công nợ phải thu và bảng lương văn phòng, sau đó expose qua các route export được bảo vệ bởi quyền tài chính/lương hiện tại. Các màn tạm ứng và lương cá nhân chỉ in/xuất dữ liệu đã được API giới hạn theo quyền, không tự suy diễn dữ liệu từ tên hiển thị.

**Tech Stack:** React, Vitest/Testing Library, FastAPI, SQLAlchemy, openpyxl, pytest.

**Spec:** User-approved audit of In/Xuất for Công nợ, Tạm ứng, Quyết toán hoàn ứng and Lương.

## Global Constraints

- Không thay đổi quy tắc phân quyền hiện có; dữ liệu cá nhân phải tiếp tục được backend giới hạn theo người dùng hiện tại.
- Không sửa hoặc xóa các thay đổi chưa liên quan trong working tree.
- Bản in phải nêu rõ trạng thái: tạm tính, đã chốt hoặc đã xác nhận chi trả.
- Báo cáo in/xuất theo danh sách phải sử dụng cùng tập dữ liệu sau bộ lọc hiện tại.
- Không commit hoặc push trong task này nếu chưa có yêu cầu riêng.
- Nếu test backend bị chặn bởi `dev/backend/src/core/redis_utils.py` đang hỏng ngoài phạm vi, phải ghi rõ và vẫn chạy các test độc lập.

---

### Task 1: Chuẩn bị test cho các hợp đồng in/xuất

**Files:**
- Modify: `dev/backend/tests/test_excel_exporter_edge_cases.py`
- Create/Modify: `dev/frontend/src/components/finance/screens/ReceivablesScreen.test.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.test.jsx`
- Create/Modify: `dev/frontend/src/features/employee-portal/MyPayroll.test.jsx`

**Interfaces:**
- Consumes: Các hàm exporter hiện có, `FinancePrintReport`, `apiFetch` mock.
- Produces: Bộ test đỏ mô tả filter, export workbook, dấu trạng thái và self-only payroll.

- [x] **Step 1: Viết test backend cho workbook công nợ và lương văn phòng**
- [x] **Step 2: Viết test frontend xác nhận báo cáo công nợ dùng dữ liệu đã lọc**
- [x] **Step 3: Viết test frontend xác nhận trạng thái bảng lương được đưa vào bản in**
- [x] **Step 4: Viết test frontend xác nhận “Lương của tôi” chỉ gọi export cho nhân sự hiện tại**
- [x] **Step 5: Chạy các test mới để xác nhận chúng fail vì tính năng chưa có**

---

### Task 2: Công nợ phải thu — in đúng bộ lọc và xuất Excel

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/ReceivablesScreen.jsx`
- Modify: `dev/backend/src/finance/excel_exporter.py`
- Modify: `dev/backend/src/routes/routes_finance_export.py`
- Modify: `dev/backend/tests/test_excel_exporter_edge_cases.py`

**Interfaces:**
- Consumes: Dữ liệu `/api/finance/receivables`, `filteredData`, mẫu exporter hiện có.
- Produces: `generate_receivables_excel(...)` và route export công nợ; nút xuất Excel trên màn công nợ; bản in dùng `filteredData` và tổng tương ứng.

- [x] **Step 1: Sửa test đỏ để kiểm tra rows/total của bản in lấy từ `filteredData`**
- [x] **Step 2: Cài exporter workbook công nợ với tiêu đề, bộ lọc/thời điểm xuất và tổng số tiền**
- [x] **Step 3: Thêm route export có quyền đọc công nợ/tài chính**
- [x] **Step 4: Thêm nút Excel và tải file ở `ReceivablesScreen`**
- [x] **Step 5: Chạy test backend và frontend của công nợ**

---

### Task 3: Bảng lương văn phòng — trạng thái bản in và xuất Excel

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.jsx`
- Modify: `dev/backend/src/finance/excel_exporter.py`
- Modify: `dev/backend/src/routes/routes_finance_export.py`
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.test.jsx`
- Modify: `dev/backend/tests/test_excel_exporter_edge_cases.py`

**Interfaces:**
- Consumes: `/api/finance/payroll`, `/api/finance/payroll/periods`, trạng thái `open/locked/paid`.
- Produces: Dấu trạng thái chính thức trong `FinancePrintReport`; route và nút xuất workbook bảng lương văn phòng.

- [x] **Step 1: Viết test cho ba trạng thái bản in**
- [x] **Step 2: Viết test workbook có tổng lương và các cột chính**
- [x] **Step 3: Thêm dấu trạng thái theo `open`, `locked`, `paid`**
- [x] **Step 4: Thêm exporter và route Excel bảng lương văn phòng**
- [x] **Step 5: Thêm nút xuất Excel và chạy test**

---

### Task 4: Lương khoán — bổ sung dấu trạng thái cho phiếu lương hiện có

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PieceRatePayrollScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PieceRatePayrollScreen.test.jsx`

**Interfaces:**
- Consumes: `ledger.period_status` và dữ liệu task/điều chỉnh hiện có.
- Produces: Phiếu lương khoán thể hiện nhất quán trạng thái tạm tính/chốt/chi trả; không thay đổi công thức lương hay endpoint hiện có.

- [x] **Step 1: Bổ sung test kiểm tra dấu trạng thái trên bản xem trước**
- [x] **Step 2: Thêm stamp và dòng ghi chú trạng thái vào bản in**
- [x] **Step 3: Chạy test phiếu lương khoán hiện có**

---

### Task 5: Đề xuất tạm ứng và quyết toán hoàn ứng — in báo cáo theo dữ liệu đang xem

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/AdvanceRequestScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/AdvanceClearScreen.jsx`
- Create/Modify: tests tương ứng trong `dev/frontend/src/components/finance/screens/`

**Interfaces:**
- Consumes: `sortedFiltered` và các trường chi tiết do `/api/finance/advance` trả về.
- Produces: Nút in danh sách theo bộ lọc; bản in chi tiết/đối soát có trạng thái và số liệu thực tế, không tạo thêm nghiệp vụ backend.

- [x] **Step 1: Viết test đỏ cho nút in và tập rows sau filter**
- [x] **Step 2: Thêm báo cáo in cho đề xuất tạm ứng**
- [x] **Step 3: Thêm báo cáo in cho quyết toán hoàn ứng**
- [x] **Step 4: Chạy test UI và kiểm tra không phá modal chi tiết hiện có**

---

### Task 6: “Lương của tôi” — in và xuất dữ liệu cá nhân

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.jsx`
- Create/Modify: `dev/frontend/src/features/employee-portal/MyPayroll.test.jsx`

**Interfaces:**
- Consumes: `employee` hiện tại, `payroll` tháng đang chọn, lịch sử lương và endpoint employee-ledger đã được backend kiểm soát quyền.
- Produces: Nút in phiếu/tóm tắt lương cá nhân và nút Excel; không hiển thị dữ liệu người khác.

- [x] **Step 1: Viết test đỏ cho nút in và export self-only**
- [x] **Step 2: Thêm bản xem trước/in tóm tắt kỳ lương đang chọn**
- [x] **Step 3: Thêm tải Excel sử dụng employee id của phiên hiện tại**
- [x] **Step 4: Chạy test màn nhân viên**

---

### Task 7: Verification

**Files:**
- Verify: Các file đã nêu trong Task 1–6.

- [x] **Step 1: Chạy test backend exporter độc lập với `TEST_DATABASE_URL` disposable**
- [x] **Step 2: Chạy test frontend focused cho Công nợ, Tạm ứng, Lương**
- [x] **Step 3: Chạy build và lint frontend**
- [x] **Step 4: Chạy `git diff --check` và kiểm tra `git status --short`**
- [x] **Step 5: Báo cáo rõ test pass/fail và blocker ngoài phạm vi; không commit/push**
