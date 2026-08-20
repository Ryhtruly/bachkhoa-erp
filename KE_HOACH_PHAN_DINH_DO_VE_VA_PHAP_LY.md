# 🏛️ KẾ HOẠCH ĐẶC TẢ KIẾN TRÚC & THỰC THI CHUẨN MỰC
## PHÂN ĐỊNH ĐO VẼ - PHÁP LÝ/XPXD, BÁO ĐỎ TIẾN TRÌNH & RESET DÂY CHUYỀN QUY TRÌNH
*(Tài liệu chuẩn hóa nghiệp vụ, phân cấp ưu tiên và hướng dẫn dành riêng cho Claude Code)*

---

## 🧭 MỤC LỤC ĐIỀU HƯỚNG NHANH
1. [Bộ Nguyên Tắc & Kỹ Năng Bắt Buộc](#-1-bộ-nguyên-tắc--kỹ-năng-bắt-buộc-dành-cho-claude-code)
2. [Bốn Nguyên Tắc Nghiệp Vụ Cốt Lõi](#-2-bốn-nguyên-tắc-nghiệp-vụ-cốt-lõi-core-business-rules)
3. [Khu Vực Phản Biện & Đối Soát Kiến Trúc Độc Lập](#-3-khu-vực-phản-biện--đối-soát-kiến-trúc-độc-lập-dành-cho-claude-code)
4. [Bảng Phân Cấp Ưu Tiên 7 Task Thực Thi](#-4-bảng-phân-cấp-ưu-tiên-7-task-thực-thi)
5. [Đặc Tả Chi Tiết Từng Task (Kèm Mã Lệnh & Giải Pháp)](#-5-đặc-tả-chi-tiết-từng-task-từ-p1-đến-p6)
6. [Khu Vực Báo Cáo, Tiến Độ & Nhật Ký Kiểm Thử](#-6-khu-vực-báo-cáo-tiến-độ--nhật-ký-kiểm-thử-claude-code-cập-nhật-tại-đây)

---

## 🧠 1. BỘ NGUYÊN TẮC & KỸ NĂNG BẮT BUỘC DÀNH CHO CLAUDE CODE

> [!IMPORTANT]
> **CHỈ THỊ CỐT LÕI:** Bạn là một Senior Software Architect & Lead Engineer độc lập.
> * **KHÔNG ĐƯỢC LÀM MÙ QUÁNG:** Trước khi chỉnh sửa bất kỳ module nào, bạn **BẮT BUỘC** phải tự mở file đọc lại code thực tế, dùng GitNexus kiểm tra call graph và luồng phụ thuộc.
> * **BẢO TỒN TÍNH TOÀN VẸN:** Mọi thay đổi phải đảm bảo bộ test `npm test` tại `dev/frontend` luôn pass 100% (49/49 tests).
> * **QUY TẮC NHẬP LIỆU NGÀY THÁNG:** Mọi trường ngày tháng trên toàn bộ giao diện **BẮT BUỘC PHẢI DÙNG Ô CHỌN LỊCH (`<input type="date">` / DatePicker)**, **TUYỆT ĐỐI KHÔNG để `<input type="text">` bắt người dùng gõ tay**!

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BỘ 4 SKILLS BẢO VỆ DÀNH CHO CLAUDE CODE:                                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. [GitNexus Guard]: Chạy `impact({target: "...", direction: "upstream"})` trước khi sửa symbol.     │
│ 2. [Business Logic Guard]: Chặn 100% việc sinh `legal_dossiers` rác cho gói Đo vẽ.                  │
│ 3. [Cascading Reset & UI Guard]: Xử lý chuẩn toán tử DAG và đồng bộ 100% GIAO DIỆN trực quan đồ thị.  │
│ 4. [DatePicker & Form Guard]: 100% trường ngày tháng phải là Date Picker cho chọn, không cho gõ tay. │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 2. BỐN NGUYÊN TẮC NGHIỆP VỤ CỐT LÕI (CORE BUSINESS RULES)

### 📌 Quy tắc 1: Phân định rõ Đo Vẽ vs Pháp Lý / XPXD
* **Gói Đo Vẽ (Survey):** Bước nộp chỉ là *Nộp bản vẽ cho cơ quan duyệt nội nghiệp* ➔ **Tuyệt đối KHÔNG tạo data `legal_dossiers` / `legal_submissions`** để theo dõi vòng đời.
* **Gói Pháp Lý & Gói XPXD:** Thực hiện thủ tục hành chính trọn gói ➔ **Tự động tạo `legal_dossiers`** theo dõi vòng đời: `ASSIGNED ➔ PROCESSING ⇄ PENDING (Tạm dừng) ➔ CLOSED (Đóng sổ)`.

### 📌 Quy tắc 2: Mẫu quy trình Pháp lý & XPXD bắt buộc có đủ K03, K05, K06
* Cả 2 gói dịch vụ hành chính (Pháp lý & XPXD) khi áp dụng hoặc lưu mẫu quy trình bắt buộc phải có đủ bộ 3 mắt xích:
  * **`K03`**: Thẩm định / Tiếp nhận hồ sơ & hiện trạng.
  * **`K05`**: Soạn và hoàn thiện bộ hồ sơ (đơn, bản vẽ, tờ khai, văn bản công chứng).
  * **`K06`**: Nộp cơ quan nhà nước (UBND/Sở XD/VP ĐKĐĐ), lấy biên nhận và theo dõi kết quả.

### 📌 Quy tắc 3: Chuẩn hóa bộ thông tin biên nhận, Cơ quan nộp & 100% DÙNG DATEPICKER
* Form biên nhận trong Lịch trình (`SubmissionReceiptPanel.jsx`) và bảng Pháp lý (`LegalSubmissions.jsx`) phải có đầy đủ 4 trường cốt lõi với chuẩn giao diện:
  1. **Số biên nhận (`receipt_code`):** Mã số biên nhận cơ quan cấp.
  2. **Cơ quan tiếp nhận / Nơi nộp (`submitted_agency`):** Datalist gợi ý nhanh 1 chạm + cho nhập tự do.
  3. **Ngày nhận biên nhận (`received_date`):** **Dùng `<input type="date">` (chọn lịch trực quan)**, ngày cơ quan xuất phiếu biên nhận.
  4. **Ngày hẹn trả kết quả (`expected_return_date`):** **Dùng `<input type="date">` (chọn lịch trực quan)**, ngày hẹn trả in trên phiếu.
* **Cho phép chỉnh sửa:** Miễn là hồ sơ **chưa đóng / chưa hoàn thành toàn bộ (`!is_locked`)**, nhân viên pháp lý **vẫn được sửa** các thông tin trên khi cơ quan dời lịch hẹn.

### 📌 Quy tắc 4: Báo đỏ quy trình, Cơ chế Reset dây chuyền & Đồng bộ Giao diện trực quan
Khi hồ sơ ở bước sau (ví dụ `K08` - Bàn giao hoặc `K06` - Nộp cơ quan) bị cơ quan/khách hàng trả về và chọn quay lại một bước trước đó (ví dụ chọn quay lại `K01`):
* **Báo đỏ quy trình & Banner cảnh báo:**
  - Banner toàn tiến trình báo đỏ: `⚠️ HỒ SƠ BỊ CƠ QUAN TRẢ VỀ — ĐANG LÀM LẠI TỪ BƯỚC K01`.
* **Cơ chế Reset dây chuyền & Thay đổi Giao diện đồ thị (UI Graph State):**
  $$\text{Chọn quay lại } \mathbf{K01} \implies \text{Reset toàn bộ chuỗi: } \mathbf{K01} \longrightarrow \mathbf{K05} \longrightarrow \mathbf{K08}$$
  - **`Node K01`:** Chuyển sang viền cam/đỏ + badge `Làm lại` (`rework_required` 🔄), mở lại trên Lịch trình của nhân viên.
  - **`Node K05` & `Node K08` (các bước đứng sau):** **Giao diện tự động xóa dấu tick xanh hoàn thành**, chuyển về màu xám/viền nét đứt trạng thái **Chờ (`pending` / `⚪`)**, các đường mũi tên nối chuyển từ màu xanh về màu xám.
  - **`Node K09` (Tất toán/Lưu trữ):** Giữ nguyên trạng thái chưa chạy tới.
* **Giám đốc DUYỆT TRỰC QUAN:** Nhân viên Pháp lý đề xuất node cần quay lại + nhập lý do ➔ Trên màn hình Giám đốc hiện popup/card **[Duyệt cho làm lại]** ➔ Bấm Duyệt thì đồ thị và tiến trình lập tức kích hoạt reset.

---

## 🧐 3. KHU VỰC PHẢN BIỆN & ĐỐI SOÁT KIẾN TRÚC ĐỘC LẬP (DÀNH CHO CLAUDE CODE)

*Claude Code đọc kỹ 5 bài toán dưới đây và ghi nhận phản biện/đề xuất tối ưu vào [Mục 6.1](#-61-phản-biện--đánh-giá-kiến-trúc-critical-thinking--architecture-review):*

1. **Bài toán Node Không Có Checklist Bị Kẹt `in_progress` (Node Without Checklist Bug):**
   * *Câu hỏi phản biện:* Khi một Node quy trình không có checklist nào (`checklist.length === 0`), hiện tại UI ẩn nút nộp và chờ quản lý duyệt checklist tự hoàn thành ➔ dẫn đến Node bị kẹt vĩnh viễn ở `in_progress`.
   * *Định hướng chuẩn:* Nếu `(task.checklist || []).length === 0` (và không phải node Bàn giao K08), `NodeActionBar` **bắt buộc phải hiển thị nút `[Nộp hoàn thành]`** (`/api/employee-portal/tasks/{id}/submit`) để nhân viên báo cáo hoàn thành gửi Quản lý / Giám đốc duyệt nghiệm thu!
2. **Bài toán Khoán Lương khi Reset Node:**
   * *Câu hỏi phản biện:* Khi `K01` và `K05` bị reset để làm lại, bản ghi khoán lương của lần làm thứ 1 đã tạo trong bảng `task_node_rates / salary_advances` sẽ xử lý thế nào?
   * *Định hướng chuẩn:* Lần làm lại **mặc định không tự sinh thêm khoán lần 2** (tránh đội chi phí cho công ty), và giữ nguyên lịch sử đợt 1 để đối soát kế toán.
3. **Bài toán Lưu Lịch Sử Checklist / File Cũ:**
   * *Câu hỏi phản biện:* Khi reset `K05` về chờ, file checklist và văn bản soạn thảo của lần trước có bị xóa trắng không?
   * *Định hướng chuẩn:* **KHÔNG ĐƯỢC XÓA TRẮNG**. Giữ nguyên kết quả và file cũ của lần 1 dưới dạng phiên bản `occurrence = 1`, khi mở lại đợt 2 sẽ tạo phiên bản mới `occurrence = 2` để bảo tồn lịch sử.
4. **Bài toán Đóng Băng KPI:**
   * *Câu hỏi phản biện:* Trong thời gian chờ `K01` đo lại và `K05` soạn lại, KPI của `K06/K08` tính thế nào?
   * *Định hướng chuẩn:* Thời gian nằm ở trạng thái `PENDING` (chờ làm lại) được **đóng băng 100%**, trừ ra khỏi tổng thời gian xử lý thực tế của nhân viên.
5. **Bài toán Phân công Nhiều người vào Node Bàn giao (Multi-assignees in K08):**
   * *Câu hỏi phản biện:* Khi phân công 2 người cùng đi giao (ví dụ cả A và B), UI hiển thị thế nào và ai được bấm?
   * *Định hướng chuẩn:* UI hiển thị đầy đủ danh sách người phụ trách (VD: `Nguyễn Văn A, Trần Văn B`), cả 2 người đều nhìn thấy task trên Lịch trình của mình và ai cũng có quyền bấm [Xác nhận bàn giao].

---

## 📊 4. BẢNG PHÂN CẤP ƯU TIÊN CÁC TASK THỰC THI

| Mức Ưu Tiên | Mã Task | Tên Hạng Mục Công Việc | Phạm Vi Ảnh Hưởng | Độ Phức Tạp | Trạng Thái |
| :--- | :--- | :--- | :--- | :---: | :---: |
| 🔥 **P1 (Highest)** | **Task 1** | Fix lỗi nút [Xác nhận bàn giao] trong Timetable của Nguyễn Văn A & UI Đa nhân sự | `HandoverPanel.jsx`, `handover.py` | Thấp | `[Chưa làm]` |
| 🔥 **P1** | **Task 2** | Fix lỗi Node không có checklist bị kẹt `in_progress` mãi mãi trong Timetable | `EmployeeWorkspaceCalendar.jsx` (`NodeActionBar`) | Thấp | `[Chưa làm]` |
| 🔥 **P2** | **Task 3** | Chuẩn hóa Form Biên nhận 100% DatePicker (Cơ quan nộp, Ngày nhận biên nhận, Ngày hẹn trả kết quả) | `SubmissionReceiptPanel.jsx`, `LegalSubmissions.jsx`, Backend | Trung bình | `[Chưa làm]` |
| ⚡ **P3** | **Task 4** | Bắt buộc Mẫu quy trình Pháp lý & XPXD phải có đủ K03 ➔ K05 ➔ K06 | `ContractWorkflowDesigner.jsx` | Thấp | `[Chưa làm]` |
| ⚡ **P4** | **Task 5** | Backend Guard chặn 100% không sinh data pháp lý rác cho gói Đo vẽ | `workflow_runtime.py`, `ContractWorkflowDesigner.jsx` | Trung bình | `[Chưa làm]` |
| 🚀 **P5 (Core)** | **Task 6** | Báo đỏ tiến trình, Đề xuất quay lại node có Sếp duyệt & Reset dây chuyền (Đồ thị + Timetable) | `legal_lifecycle.py`, `workflow_runtime.py`, `ContractWorkflowDesigner.jsx`, `ContractTimeline.jsx` | Cao | `[Chưa làm]` |
| 🧹 **P6 (Final)** | **Task 7** | Dọn dẹp toàn bộ data test rác cũ & Khởi tạo bộ Data mẫu chuẩn hóa 100% | Database migrations / seed scripts | Trung bình | `[Chưa làm]` |

---

## 🛠️ 5. ĐẶC TẢ CHI TIẾT TỪNG TASK (TỪ P1 ĐẾN P6)

### ⚡ [P1] Task 1: Fix Lỗi Nút "Xác nhận bàn giao" Trong Màn Hình Timetable Của Nguyễn Văn A & Đảm Bảo UI Đa Nhân Sự
* **Mô tả hiện tượng lỗi thực tế:**
  1. **Người dùng:** Nhân viên **Nguyễn Văn A**.
  2. **Màn hình:** **Lịch trình công việc (Timetable / Employee Workspace Calendar)** tại `EmployeeWorkspaceCalendar.jsx`.
  3. **Thao tác:** Nguyễn Văn A mở popup chi tiết của Node Bàn giao **`K08`**, khách hàng đã đóng đủ 100% tiền (25.000.000đ). Nguyễn Văn A bấm vào nút màu cam **`[Xác nhận bàn giao]`** nhưng **không có bất kỳ phản hồi nào trên màn hình**.
  4. **Nguyên nhân kỹ thuật:**
     - Modal cha Lịch trình (`EmployeeWorkspaceCalendar.jsx`) sử dụng `overlayClassName="employee-workspace-node-modal-overlay"` có `z-index: 120`.
     - Modal con xác nhận bàn giao (`showDeliver`) trong `HandoverPanel.jsx` (dòng 415) **thiếu thuộc tính `overlayClassName="modal-overlay--top"`**, khiến nó render mặc định với `z-index: 100` và bị **chìm hoàn toàn ở phía dưới modal Lịch trình**.
* **File cần chỉnh sửa:** `dev/frontend/src/features/handover/HandoverPanel.jsx` & `dev/backend/src/dossiers/handover.py`.
* **Hành động cụ thể:**
  1. **Sửa Z-Index Modal:** Trong `HandoverPanel.jsx` (dòng 415), thay đổi thành:
     ```jsx
     <Modal 
       open={showDeliver} 
       onClose={() => setShowDeliver(false)} 
       title="Xác nhận bàn giao" 
       overlayClassName="modal-overlay--top"
     >
     ```
  2. **Đảm bảo UI Đa nhân sự (Multi-Assignees):**
     - Trong `handover.py` & `HandoverPanel.jsx`: Trả về và hiển thị danh sách đầy đủ các nhân viên phụ trách giao hồ sơ (VD: `Nguyễn Văn A, Trần Văn B`), đảm bảo cả 2 đều thấy task trên Lịch trình của mình và đều bấm bàn giao được.

---

### ⚡ [P1] Task 2: Fix Lỗi Node Không Có Checklist Bị Kẹt `in_progress` Mãi Mãi
* **Mô tả hiện tượng lỗi thực tế:**
  - Khi một Node công việc không có mục checklist nào (`checklist.length === 0`), logic trong `NodeActionBar` (`EmployeeWorkspaceCalendar.jsx` dòng 321-332) ẩn nút *"Nộp hoàn thành"* và báo dòng chữ: *"Đã nộp hết checklist, đang chờ quản lý duyệt — duyệt xong bước tự hoàn thành"*.
  - Nhưng vì **không có checklist nào được nộp**, Quản lý không có gì để duyệt ➔ Node bị kẹt ở trạng thái `in_progress` mãi mãi, nhân viên không có cách nào nộp hoàn thành bước này.
* **File cần sửa:** `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx` (`NodeActionBar`).
* **Hành động cụ thể:**
  - Trong `NodeActionBar`: Nếu `(task.checklist || []).length === 0` (và không phải bước Bàn giao có panel riêng):
    ```jsx
    if (task.status === 'in_progress') {
      const checklistCount = (task.checklist || []).length
      if (checklistCount === 0) {
        return (
          <button 
            type="button" 
            className="btn btn-primary btn-sm" 
            disabled={busy} 
            onClick={async () => {
              setBusy(true)
              try {
                await apiFetch(`/api/employee-portal/tasks/${task.id}/submit`, { method: 'POST' })
                addToast('Đã nộp hoàn thành công việc, chờ quản lý duyệt', 'success')
                await onChanged()
              } catch (err) {
                addToast(err.message || 'Không thể nộp hoàn thành', 'error')
              } finally {
                setBusy(false)
              }
            }}
          >
            <CheckCircle2 size={14} /> Nộp hoàn thành công việc
          </button>
        )
      }
      // ... giữ nguyên logic nhắc checklist cho node có checklist
    }
    ```

---

### ⚡ [P2] Task 3: Chuẩn Hóa Bộ Thông Tin Biên Nhận (100% Dùng DatePicker Cho Chọn, Cơ Quan Nộp) & Cho Phép Sửa
* **File cần sửa:**
  - `dev/frontend/src/features/legal-dossier/SubmissionReceiptPanel.jsx`
  - `dev/frontend/src/pages/legal/LegalSubmissions.jsx`
  - `dev/backend/src/dossiers/routes_legal_submissions.py`
* **Hành động cụ thể:**
  1. Thêm trường **Cơ quan tiếp nhận (`submitted_agency`)** với `<datalist>` gợi ý nhanh (Chi nhánh VP ĐKĐĐ, Một cửa UBND Quận/Huyện, UBND Xã/Phường, Sở Xây Dựng, Phòng QLĐT...).
  2. **100% DÙNG DATEPICKER:** Cả 2 trường **Ngày nhận biên nhận (`received_date`)** và **Ngày hẹn trả kết quả (`expected_return_date`)** bắt buộc dùng `<input type="date" className="form-control" />` để người dùng chọn trên lịch trực quan, tuyệt đối không để `<input type="text">`.
  3. Cập nhật điều kiện cho phép sửa biên nhận bất cứ khi nào hồ sơ chưa đóng (`!submission.is_locked`).
  4. Hiển thị đồng bộ các cột `NƠI NỘP / CƠ QUAN`, `NGÀY NHẬN BIÊN NHẬN`, `NGÀY HẸN TRẢ KẾT QUẢ` trên bảng `LegalSubmissions.jsx`.

---

### ⚡ [P3] Task 4: Bắt Buộc Mẫu Quy Trình Gói Pháp Lý & XPXD Phải Có K03, K05, K06
* **File cần sửa:** `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`.
* **Hành động cụ thể:**
  1. Cập nhật các template chuẩn `WF_PHAPLY_...` và `WF_XPXD_...` có đầy đủ chuỗi: **K03 ➔ K05 ➔ K06 ➔ K08**.
  2. Bổ sung validation: Nếu người dùng cấu hình quy trình cho gói Pháp lý / XPXD mà thiếu 1 trong 3 node trên thì cảnh báo và hướng dẫn bổ sung.

---

### ⚡ [P4] Task 5: Backend Guard Chặn 100% Không Sinh Data Pháp Lý Rác Cho Gói Đo Vẽ
* **File cần sửa:** `dev/backend/src/contracts/workflow_runtime.py` & `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`.
* **Hành động cụ thể:**
  1. Trong `workflow_runtime.py`, kiểm tra hàm `_maybe_create_legal_submission()`: Đảm bảo chỉ tạo record `legal_dossiers` khi gói dịch vụ là Pháp lý / XPXD (`context.get("service_package_id") == LEGAL_PACKAGE_ID`).
  2. Trong `ContractWorkflowDesigner.jsx`: Gói Đo vẽ ghi rõ `Nộp duyệt nội nghiệp cơ quan (Không tạo hồ sơ pháp lý theo dõi)`, mô tả gợi ý duyệt bản vẽ kỹ thuật.

---

### ⚡ [P5] Task 6: Báo Đỏ Tiến Trình, Đề Xuất Quay Lại Node Có Giám Đốc Duyệt & Reset Dây Chuyền (Đồ Thị + Timetable)
* **File cần sửa:**
  - `dev/backend/src/dossiers/legal_lifecycle.py`
  - `dev/backend/src/contracts/workflow_runtime.py`
  - `dev/backend/src/dossiers/routes_legal_dossiers.py`
  - `dev/frontend/src/features/legal-dossier/LegalDossierActions.jsx`
  - `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
  - `dev/frontend/src/components/contracts/ContractTimeline.jsx`
  - `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
* **Hành động cụ thể:**
  1. **Backend Endpoints:**
     - `POST /api/legal-dossiers/{id}/request-rework`: Nhân viên đề xuất node cần quay lại (`target_node_code`), nhập lý do, đính kèm công văn từ chối.
     - `POST /api/legal-dossiers/{id}/approve-rework`: Giám đốc duyệt ➔ Chạy thuật toán Cascading Reset (Set `target_node.status = 'rework_required'`, set các node trung gian đứng sau `status = 'pending'`, xóa cờ hoàn thành).
  2. **Frontend UI & Đồ thị Sơ đồ:**
     - Thêm modal **[Đề xuất làm lại]** cho Pháp lý & nút **[Duyệt làm lại]** cho Giám đốc.
     - **Cập nhật Giao diện Đồ thị Sơ đồ:** Node quay lại đổi viền cam badge `Làm lại 🔄`; các node đứng sau xóa tick xanh chuyển màu xám chờ `⚪`; đường mũi tên chuyển màu xám; hiện banner báo đỏ `⚠️ HỒ SƠ BỊ CƠ QUAN TRẢ VỀ — ĐANG LÀM LẠI TỪ BƯỚC...`.
     - **Cập nhật Lịch trình Timetable:** Mở lại task cho nhân viên bước quay lại; khóa các bước đứng sau cho đến khi bước quay lại hoàn thành.

---

### ⚡ [P6] Task 7: Dọn Dẹp Toàn Bộ Data Test Rác & Khởi Tạo Bộ Data Mẫu Chuẩn Hóa 100%
* **Hành động cụ thể:**
  1. **Clean:** Xóa sạch hợp đồng test rác, hồ sơ pháp lý test cũ, các đợt nộp và template quy trình thử nghiệm trong database.
  2. **Seed:** Tạo bộ dữ liệu mẫu chuẩn:
     - `Mẫu Đo Vẽ Kỹ Thuật Chuẩn`: K01 ➔ K02 ➔ K08.
     - `Mẫu Hồ Sơ Pháp Lý Chuẩn`: K01 ➔ K03 ➔ K05 ➔ K06 ➔ K08.
     - `Mẫu Xin Phép Xây Dựng Chuẩn`: K01 ➔ K03 ➔ K05 ➔ K06 ➔ K08.
     - 03 Hợp đồng thực tế mẫu đại diện cho 3 gói dịch vụ trên.

---

## 📝 6. KHU VỰC BÁO CÁO, TIẾN ĐỘ & NHẬT KÝ KIỂM THỬ (CLAUDE CODE CẬP NHẬT TẠI ĐÂY)

### 💬 6.1. Phản biện & Đánh giá Kiến trúc (Critical Thinking & Architecture Review)
*Claude Code ghi nhận xét, phản biện độc lập và đề xuất giải pháp tối ưu vào đây trước/trong khi làm:*
> *(Claude Code ghi phản biện kiến trúc tại đây...)*

---

### 📊 6.2. Tiến Độ Thực Thi Chi Tiết (Implementation Progress)

| Priority | Mã Task | Hạng mục công việc | Trạng thái | File đã chỉnh sửa | Ghi chú |
| :---: | :---: | :--- | :---: | :--- | :--- |
| **P1** | **Task 1** | Fix nút [Xác nhận bàn giao] trong Timetable của Nguyễn Văn A & UI Đa nhân sự | `[Chưa làm]` | `HandoverPanel.jsx`, `handover.py` | |
| **P1** | **Task 2** | Fix lỗi Node không có checklist bị kẹt in_progress mãi mãi trong Timetable | `[Chưa làm]` | `EmployeeWorkspaceCalendar.jsx` | |
| **P2** | **Task 3** | Chuẩn hóa Form Biên nhận 100% DatePicker (Cơ quan nộp, Ngày nhận, Ngày hẹn trả) | `[Chưa làm]` | `SubmissionReceiptPanel.jsx`, `LegalSubmissions.jsx` | |
| **P3** | **Task 4** | Mẫu quy trình Pháp lý & XPXD bắt buộc có K03, K05, K06 | `[Chưa làm]` | `ContractWorkflowDesigner.jsx` | |
| **P4** | **Task 5** | Backend Guard chặn sinh hồ sơ pháp lý rác cho Đo vẽ | `[Chưa làm]` | `workflow_runtime.py` | |
| **P5** | **Task 6** | Báo đỏ quy trình, Đề xuất quay lại node & Cập nhật UI đồ thị | `[Chưa làm]` | `legal_lifecycle.py`, `ContractWorkflowDesigner.jsx` | |
| **P6** | **Task 7** | Dọn dẹp data test cũ & Khởi tạo bộ data mẫu chuẩn mới | `[Chưa làm]` | Database seed scripts / migration | |

---

### 🧪 6.3. Nhật Ký Kiểm Thử (Verification & Test Log)
* **Kết quả Unit Test (`npm test`):** `.../49 tests passed`
* **Checklist kiểm thử thực tế giao diện:**
  - [ ] **P1:** Bấm nút [Xác nhận bàn giao] trong Timetable của Nguyễn Văn A (popup nổi lên trên cùng, thao tác thành công).
  - [ ] **P1:** Thử mở Node không có checklist ở trạng thái in_progress ➔ Có nút [Nộp hoàn thành công việc] và nộp thành công.
  - [ ] **P1:** Phân công 2 nhân viên giao hồ sơ (UI hiện đủ cả 2 tên, cả 2 đều thấy task trên Timetable).
  - [ ] **P2:** Form biên nhận dùng 100% ô chọn lịch DatePicker (`<input type="date">`), chọn Ngày nhận biên nhận & Ngày hẹn trả kết quả mượt mà.
  - [ ] **P2:** Thử sửa lại biên nhận khi hồ sơ chưa đóng (lưu thành công).
  - [ ] **P3:** Mẫu quy trình Pháp lý / XPXD bắt buộc có đủ K03-K05-K06.
  - [ ] **P4:** Kích hoạt hợp đồng Đo vẽ (xác nhận không bị sinh record trong bảng `legal_dossiers`).
  - [ ] **P5:** Thao tác Báo đỏ & Reset dây chuyền K08 -> K01 (Đồ thị K05/K08 mất tick xanh chuyển xám, K01 viền cam làm lại, banner báo đỏ).
  - [ ] **P6:** Dọn sạch data rác cũ, tạo mới 3 mẫu quy trình và 3 hợp đồng mẫu sạch sẽ.

---

### 📌 6.4. Ghi Chú & Khuyến Nghị Bàn Giao (Handoff Notes)
> *(Claude Code tóm tắt ngắn gọn các lưu ý quan trọng cho Giám đốc và đội ngũ vận hành sau khi hoàn thành...)*
