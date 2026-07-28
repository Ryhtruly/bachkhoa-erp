# Log Refactoring: Tách `models.py` thành Package `models`

**Thời gian:** 2026-07-28  
**Tác giả:** AI Assistant (Antigravity)

---

## 1. Lý do thực hiện
Tệp tin `dev/backend/src/db/models.py` chứa quá nhiều lớp dữ liệu (37 classes tương ứng với 37 bảng dữ liệu của hệ thống ERP). Điều này gây khó khăn cho việc quản lý, đọc hiểu, phân tách trách nhiệm và bảo trì mã nguồn trong các giai đoạn tiếp theo.

---

## 2. Chi tiết các bước đã làm

1. **Xóa file models cũ**:
   - Xóa file `dev/backend/src/db/models.py`.

2. **Tạo cấu trúc thư mục mới**:
   - Tạo thư mục `dev/backend/src/db/models/`.

3. **Phân tách các lớp dữ liệu thành các module con**:
   - `_base.py`: Chứa các khai báo Base, get_utc_now và thư viện SQLAlchemy dùng chung.
   - `auth.py`: Chứa các bảng liên quan đến tài khoản, bảo mật và quyền truy cập (`User`, `Role`, `UserRole`, `RolePermission`, `AuthToken`, `AuditLog`, `Notification`).
   - `crm.py`: Chứa các bảng liên quan đến khách hàng, cơ hội bán hàng và hợp đồng (`Customer`, `LeadPipeline`, `Contract`, `ZaloInteraction`, `ServiceLine`).
   - `operations.py`: Chứa các bảng liên quan đến công việc kỹ thuật, quy trình đo đạc và tiến trình hồ sơ (`TaskType`, `TaskTypeRate`, `ProjectTask`, `TaskSubmission`, `TaskPayRecord`, `LegalSubmission`).
   - `finance.py`: Chứa các bảng liên quan đến thu chi, quỹ tiền mặt và tài chính hợp đồng (`CashflowTransaction`, `Receivable`, `FundOpeningBalance`, `FinanceSetting`, `ContractExpense`).
   - `hr_payroll.py`: Chứa các bảng liên quan đến nhân sự, tính lương, chấm công và nghỉ phép (`Department`, `Employee`, `KpiPayroll`, `PayrollPeriod`, `PayrollAdjustment`, `Attendance`, `LeaveRecord`).
   - `communication.py`: Chứa các bảng phục vụ tính năng chat, hội thoại (`ChatRoom`, `Message`, `ChatParticipant`).
   - `wiki.py`: Chứa các bảng liên quan đến kho tri thức và RAG chunks (`WikiDocument`, `WikiChunk`).
   - `settings.py`: Chứa bảng cấu hình hệ thống chung (`SystemSetting`).
   - `integrations.py`: Chứa các bảng tích hợp dịch vụ ngoài (`GoogleSheetSyncConfig`).

4. **Tạo file cấu hình khởi tạo để giữ tính tương thích (Backward Compatibility)**:
   - Tạo `__init__.py` thực hiện import tất cả các model từ các module con và đưa vào danh sách `__all__`.
   - Giúp cho tất cả mã nguồn cũ sử dụng import kiểu `from src.db.models import User` vẫn chạy ổn định và không cần thay đổi bất cứ dòng code nào ở các file route/service.

---

## 3. Kết quả xác thực (Verification)

- **Import test**: Toàn bộ 37/37 models được tải thành công từ package mới mà không phát sinh lỗi cú pháp hay thiếu import.
- **Table mapping check**: Trùng khớp 100% (37/37 bảng), không thiếu bất kỳ bảng nào so với Supabase schema.
- **Route check**: Tất cả các routes API (`routes_finance`, `routes_payroll`, `routes_hoso`, `routes_crm`, `routes_dashboard`, `routes_auth`, `routes_settings`, `routes_wiki`, `routes_ai`, `routes_luong`) hoạt động ổn định và có thể import model bình thường qua package mới.
- **GitNexus change detection**: Không phát sinh lỗi liên kết ký hiệu (risk: none).

---

## 4. Cài đặt thư viện & Chạy Test Phase 1

1. **Cài đặt thư viện (requirements.txt)**:
   - Đã chạy kiểm tra và cài đặt toàn bộ các thư viện được định nghĩa trong `requirements.txt` vào môi trường ảo của dự án (`.venv`).
   - Kết quả: Các thư viện cần thiết (`SQLAlchemy`, `FastAPI`, `pgvector`, `docxtpl`, `pydantic`, v.v.) đã được cài đặt đầy đủ và sẵn sàng sử dụng.

2. **Tạo kịch bản chạy test tự động cho Phase 1**:
   - Tạo file script [verify_phase1.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase1.py) để người dùng có thể dễ dàng chạy test tại máy cục bộ bằng lệnh:
     ```powershell
     .\.venv\Scripts\python.exe scripts\verify_phase1.py
     ```
   - Script này tự động cấu hình `sys.path` để khắc phục lỗi tìm kiếm import của Python (thêm cả thư mục gốc của backend và thư mục `src` vào python path), sau đó thực hiện:
     - Kiểm tra khả năng import của gói `src.db.models`.
     - So khớp danh sách 37 bảng giữa SQLAlchemy và Supabase DB Schema.
     - Kiểm tra tính toàn vẹn của các cột mới được bổ sung.
     - Thử nghiệm import toàn bộ 13 routes API có phụ thuộc vào models.

3. **Kết quả chạy Test**:
   - Chạy thành công 100% với đầu ra:
     ```text
     ✅ Successfully imported all models from package 'src.db.models'!
     Checking table coverage (Expected: 37, Mapped: 37)...
     ✅ Table coverage is perfect! (100% of Supabase tables map to SQLAlchemy models)
     Verifying model column integrity...
     ✅ Model columns aligned correctly!
     Verifying all 13 route modules can be imported...
     ✅ All 13 route modules imported cleanly!
     🎉 PHASE 1 VERIFICATION COMPLETED SUCCESSFULLY!
     ```

## 5. Phase 02A - Refactoring Finance: Tách thành Cấu trúc 3-Lớp (Route/Service/Repository)

**Thời gian:** 2026-07-28  
**Tác giả:** AI Assistant (Antigravity)

### Chi tiết các bước đã làm:

1. **Tạo Package mới `src/finance`**:
   - `schemas.py`: Định nghĩa toàn bộ 9 Pydantic schemas liên quan đến request payload của Finance.
   - `serializers.py`: Chứa các hàm ánh xạ/mapper để serialize dữ liệu trả về cho Frontend (`serialize_cashflow`, `serialize_cashflow_bulk`, `serialize_employee`), giải quyết vấn đề N+1 query.
   - `domain_rules.py`: Chứa các điều kiện và nghiệp vụ validation cốt lõi (kiểm tra chốt sổ, kiểm tra số dư quỹ âm, xác thực tính tồn tại của hợp đồng/hồ sơ dự án, v.v.).
   - `repository.py`: Tập trung tất cả các truy vấn dữ liệu thô (SQLAlchemy query), các phép tính tổng hợp tiền tệ và lọc báo cáo.
   - `services.py`: Điều phối luồng nghiệp vụ (use cases), quản lý transaction (`db.commit()`, `db.rollback()`), ghi nhật ký hệ thống (Audit Log), và xử lý side-effects.
   - `__init__.py`: Đóng gói và public các module cốt lõi của package.

2. **Refactor Routes**:
   - Viết lại toàn bộ [routes_finance.py](file:///t:/github/bachkhoa-erp/dev/backend/src/routes/routes_finance.py). Loại bỏ hoàn toàn hơn 1000 dòng code logic trộn lẫn và định nghĩa Pydantic cục bộ. Giờ đây, route chỉ chịu trách nhiệm nhận HTTP requests, kiểm tra DI `SessionDepends`, và gọi Service/Repository tương ứng.

3. **Xóa file CRUD cũ**:
   - Xóa bỏ file `dev/backend/src/crud/crud_finance.py` do toàn bộ logic đã được chuyển đổi sang package mới.

### Kết quả xác thực (Verification):

- **Script kiểm tra tự động Phase 2A**:
  - Tạo và chạy thành công script [verify_phase2a.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase2a.py). Kết quả đầu ra:
    ```text
    Running Phase 2A Verification...
    1. Verifying imports from 'src.finance'...
    ✅ Successfully imported all classes/functions from package 'src.finance'!
    2. Verifying 'src.routes.routes_finance' compilation and imports...
    ✅ Successfully imported 'src.routes.routes_finance'!
    ✅ All 34 expected endpoint handlers are defined on the route module!
    🎉 PHASE 2A FINANCE REFAC VERIFICATION COMPLETED SUCCESSFULLY!
    ```

- **Đảm bảo không Regression**:
  - Chạy lại [verify_phase1.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase1.py) thành công 100%, không bị ảnh hưởng hay lỗi biên dịch chéo nào.

## 6. Phase 02B - Refactoring Contracts: Tách thành Cấu trúc 3-Lớp (Route/Service/Repository)

**Thời gian:** 2026-07-28  
**Tác giả:** AI Assistant (Antigravity)

### Chi tiết các bước đã làm:

1. **Tạo Package mới `src/contracts`**:
   - `schemas.py`: Định nghĩa Pydantic schemas cho Hợp đồng (`HopdongCreateSchema`, `ContractGenerateSchema`).
   - `read_model.py`: Di chuyển toàn bộ cơ chế cache read model bằng Redis từ `src/services/contract_read_service.py` cũ sang.
   - `repository.py`: Khai báo các câu lệnh truy vấn SQLAlchemy liên quan đến Hợp đồng và Khách hàng (`ContractRepository`).
   - `services.py`: Quản lý các nghiệp vụ tạo hợp đồng, sinh file mẫu hợp đồng (.docx), lưu dữ liệu Công nợ (Receivable) và đồng bộ hóa cache read model (`ContractService`).
   - `__init__.py`: Đóng gói package và định nghĩa public API.

2. **Refactor Routes & Tương thích**:
   - Tối giản hóa [routes_hopdong.py](file:///t:/github/bachkhoa-erp/dev/backend/src/routes/routes_hopdong.py) thành router điều hướng thuần túy.
   - Sửa lại [routes_crm.py](file:///t:/github/bachkhoa-erp/dev/backend/src/routes/routes_crm.py) để thay đổi đường dẫn import hàm đồng bộ cache sang package `src.contracts` mới.
   - Cập nhật [schemas/models.py](file:///t:/github/bachkhoa-erp/dev/backend/src/schemas/models.py) để import lại các schema cũ từ package mới nhằm giữ tương thích ngược 100% cho các module khác.

3. **Xóa file Dịch vụ cũ**:
   - Xóa bỏ file `dev/backend/src/services/contract_read_service.py`.

### Kết quả xác thực (Verification):

- **Script kiểm tra tự động Phase 2B**:
  - Tạo và chạy thành công script [verify_phase2b.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase2b.py). Kết quả đầu ra:
    ```text
    Running Phase 2B Verification...
    1. Verifying imports from 'src.contracts'...
    ✅ Successfully imported all classes/functions from package 'src.contracts'!
    2. Verifying 'src.routes.routes_hopdong' compilation and imports...
    ✅ Successfully imported 'src.routes.routes_hopdong'!
    ✅ All expected endpoints are defined on the routes_hopdong module!
    3. Verifying 'src.routes.routes_crm' compilation...
    ✅ Successfully imported 'src.routes.routes_crm'!
    🎉 PHASE 2B CONTRACTS REFAC VERIFICATION COMPLETED SUCCESSFULLY!
    ```

- **Đảm bảo không Regression**:
  - Chạy lại [verify_phase1.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase1.py) và [verify_phase2a.py](file:///t:/github/bachkhoa-erp/dev/backend/scripts/verify_phase2a.py) thành công 100%.

