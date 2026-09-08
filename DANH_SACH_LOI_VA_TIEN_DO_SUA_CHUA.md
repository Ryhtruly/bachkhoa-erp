# 🛠️ DANH SÁCH LỖ HỔNG & TIẾN ĐỘ SỬA CHỮA HỆ THỐNG
## DỰ ÁN: BÁCH KHOA ERP (WIFIM)
> **Quy ước làm việc chung giữa JARVIS & CLAUDE CODE**:  
> - File này là **nguồn thông tin duy nhất (Single Source of Truth)** theo dõi toàn bộ các lỗi cần sửa.
> - **Claude Code** sau khi sửa xong từng mục sẽ đánh dấu `[x] ĐÃ HOÀN THÀNH` và ghi chú tóm tắt cách sửa/commit vào mục tương ứng.

---

### 📊 BẢNG TỔNG HỢP TIẾN ĐỘ SỬA LỖI

| Mã Lỗi | Hạng Mục / Module | Vị Trí File Ảnh Hưởng | Mức Độ | Trạng Thái |
| :---: | :--- | :--- | :---: | :---: |
| **BUG-01** | 🖼️ Tài Chính / Bill | [`ReceiptLinks.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/ReceiptLinks.jsx#L18) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-02** | 💻 Hợp Đồng / macOS DOCX | [`Contracts.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Contracts.jsx#L188) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-03** | 🕸️ Workflow / Graph Validation | [`workflow_runtime.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/contracts/workflow_runtime.py#L164) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-04** | 📝 Workflow / UI Nghiệm Thu | [`ContractWorkflowDesigner.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx) | 🟡 Trung bình | `[x] Đã sửa` |
| **BUG-05** | 📦 Bàn Giao / Deliverables | [`HandoverPanel.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/features/handover/HandoverPanel.jsx) | 🟡 Trung bình | `[x] Đã sửa` |
| **BUG-06** | 📄 Mẫu DOCX / Field Mapping | [`services.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/contracts/services.py#L73) & [`doc_generator.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/doc_generator.py) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-07** | 🔌 Workflow / Không Kéo Nối Dây Được Node Mới | [`ContractWorkflowDesigner.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx#L104-L132) | 🔴 Cao | `[ ] Chờ xác nhận` |
| **BUG-08** | 💰 Thu Tiền / Khoá Theo Bước Bàn Giao | [`handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/dossiers/handover.py#L639) & [`DebtCollection.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/DebtCollection.jsx) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-09** | 🔔 Duyệt Tiền / Không Có Thông Báo & Không Lưu Dấu Vết | [`routes_notifications.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_notifications.py#L52) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-10** | ⚡ Hiệu Năng / Tải Chậm Node K08 (Bàn Giao & Công Nợ) | [`handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/dossiers/handover.py) & [`HandoverPanel.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/features/handover/HandoverPanel.jsx) | 🟡 Trung bình | `[x] Đã sửa` |
| **BUG-11** | 🧊 Cache Redis / Số Tiền Cũ Sau Khi Duyệt | [`redis_utils.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/redis_utils.py#L82) & [`routes_finance.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_finance.py) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-12** | 💥 Import Thiếu / `invalidate_cache` NameError | [`routes_contracts.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_contracts.py#L35) | 🔴 Cao | `[x] Đã sửa` |
| **BUG-13** | 🔑 Thiếu Token / Lập Phiếu Không Ra Số Chứng Từ | [`PrintVoucherScreen.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx#L317) | 🟡 Trung bình | `[x] Đã sửa` |
| **BUG-14** | 🖤 Trang Hợp Đồng Trắng Màn Hình Khi `/api/config` Thiếu Khoá | [`Contracts.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Contracts.jsx#L91) | 🟡 Trung bình | `[x] Đã sửa` |
| **BUG-15** | 🕳️ Cache Workspace Không Ghi Được (datetime not serializable) | [`redis_utils.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/redis_utils.py#L52) | 🟡 Trung bình | `[x] Đã sửa` |

---

## 🔍 CHI TIẾT TỪNG LỖ HỔNG & HƯỚNG DẪN XỬ LÝ CHO CLAUDE

---

### 🔴 BUG-01: Bấm không mở được ảnh bill chuyển khoản / biên lai thanh toán
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/frontend/src/components/finance/ReceiptLinks.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/ReceiptLinks.jsx#L18)
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `ReceiptLinks.jsx`
  > - Thêm `Authorization: Bearer <token>` từ `getAccessToken()` vào `fetch`.
  > - Bỏ `window.open('about:blank')`, thay bằng khung xem ảnh trực tiếp trên trang, hỗ trợ cả ảnh và PDF.

---

### 🔴 BUG-02: Lỗi lưu file DOCX trên MacBook & chặn tạo hợp đồng trên Safari
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/frontend/src/pages/Contracts.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Contracts.jsx#L188-L191)
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `Contracts.jsx`
  > - Bỏ `return` chặn đứng khi `SaveLocationUnsupported`.
  > - Thêm fallback tự động tải DOCX về thư mục Downloads qua thẻ `<a download>`.

---

### 🔴 BUG-03: Kích hoạt Workflow cho phép "Node mồ côi" (Graph đứt đoạn)
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/backend/src/contracts/workflow_runtime.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/contracts/workflow_runtime.py#L164)
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `workflow_runtime.py`
  > - Duyệt BFS từ `start_node`, chặn kích hoạt nếu có bước rời kèm danh sách tên và mã bước.

---

### 🔴 BUG-06: Lệch trường Placeholder trong Mẫu Hợp Đồng DOCX (Không điền được dữ liệu)
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/backend/src/contracts/services.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/contracts/services.py#L73-L100) và [`dev/backend/src/core/doc_generator.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/doc_generator.py#L80-L96)
- **Nguyên nhân gốc**:
  - Mẫu Word `mau_hop_dong.docx` dùng placeholder in hoa tiếng Việt: `{{TEN_KHACH_HANG}}`, `{{SO_HOP_DONG}}`, `{{DIA_CHI}}`, `{{SO_DIEN_THOAI}}`, `{{GIA_TRI_HOP_DONG}}`, `{{LOAI_DICH_VU}}`, `{{NGAY_KY}}`, `{{NGAY_HET_HAN}}`.
  - Backend trả ra key viết thường tiếng Anh: `{"customer_name": ..., "contract_id": ...}` nên không match được placeholder.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `services.py` (`build_current_contract_document_data`)
  > - **Đã tái hiện & đọc placeholder thật từ cả 2 file .docx**: `mau_hop_dong.docx` (10 placeholder tiếng Việt) & `Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx` (11 placeholder tiếng Anh).
  > - Hàm `build_current_contract_document_data` nay trả **đồng thời cả 2 bộ key** + bộ key cũ để không bị gãy chỗ khác.
  > - **Đọc số tiền thành chữ**: Viết thuật toán `doc_tien_thanh_chu()` thuần Python không phụ thuộc thư viện ngoài (`18.500.000` → *Mười tám triệu năm trăm nghìn đồng chẵn*).
  > - **Format ngày tháng & tiền tệ chuẩn VN**: Định dạng dấu chấm `32.000.000`, xử lý không bị trùng lặp chữ "ngày" và "VNĐ".
  > - Test tải file qua API trả `HTTP 200`, 37.841 byte, điền đủ 100% các ô.

---

### 🔴 BUG-07: Lỗi không thể kéo thả nối dây (Connect) giữa các Node mới thêm từ Danh Mục
- **Trạng thái**: `[ ] Chờ xác nhận` — đã sửa trong code, chờ anh/chị thử lại trên UI rồi mới đánh `[x]`
- **File cần sửa**: [`dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx#L104-L132) và hàm `onConnect` (dòng 721)
- **Nguyên nhân gốc**:
  1. Trong `WorkflowNode`:
     ```javascript
     const incomingHandles = data.incomingHandles?.length ? data.incomingHandles : [{ id: 'in:default' }];
     const outgoingHandles = data.outgoingHandles?.length ? data.outgoingHandles : [{ id: 'out:default' }];
     ```
  2. Khi 1 Node đã có sẵn đường nối (ví dụ load từ mẫu hoặc vừa nối 1 dây xong), mảng `incomingHandles` / `outgoingHandles` chỉ chứa ID của dây cũ (ví dụ: `in:k01:k02:0`). **Điểm nối mặc định `in:default` / `out:default` hoàn toàn biến mất khỏi DOM**!
  3. Khi người dùng thêm 1 node mới từ Danh mục và kéo dây từ Node mới sang Node cũ (hoặc ngược lại), React Flow tìm không thấy điểm nối đích khả dụng (`isConnectable`) nên **hủy thao tác nối dây ngay lập tức (không kéo vào nhau được)**!
- **Yêu cầu xử lý**:
  - Mỗi `WorkflowNode` luôn phải luôn có sẵn cổng nhận kết nối đa điểm:
    + Cổng vào (Target Handle) bên trái: Luôn cho phép nhận nhiều dây nối vào (hoặc render thêm 1 cổng default mở để hứng dây mới).
    + Cổng ra (Source Handle) bên phải: Luôn có 1 cổng ra mở sẵn để kéo dây sang node khác.
    + Hoặc đơn giản hóa hệ thống Handle: Dùng 1 Source Handle cố định bên phải (`id="out:default"`) và 1 Target Handle cố định bên trái (`id="in:default"`) cho phép `isConnectable={true}` nhiều dây kết nối, không ghi đè mất Handle khi thêm edge mới.
- **Ghi chú của Claude sau khi sửa**:
  > *(Claude điền kết quả sửa & verify test vào đây)*

---

### 🟡 BUG-04: Bổ sung giao diện Phê duyệt / Yêu cầu làm lại Nghiệm thu (Acceptance Review UI)
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx)
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `ContractWorkflowDesigner.jsx`
  > - Thêm ô nhập *"Lý do trả lại"* (bắt buộc $\ge 5$ ký tự) khi bấm [Cần làm lại].

---

### 🟡 BUG-05: Đóng gói toàn bộ tài liệu Bàn giao cho Khách hàng
- **Trạng thái**: `[x] Đã sửa`
- **File cần sửa**: [`dev/frontend/src/features/handover/HandoverPanel.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/features/handover/HandoverPanel.jsx)
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — `HandoverPanel.jsx` + `handover.py` + `routes_handover.py`
  > - Thêm `GET /api/handover/{node}/deliverables.zip` đóng gói trọn bộ CAD, PDF, scan Sổ đỏ, ảnh hiện trạng.

---

### ⚡ BUG-10: Tối ưu hóa tốc độ tải dữ liệu Node K08 (Bàn giao & Cổng công nợ)
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`dev/backend/src/dossiers/handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/dossiers/handover.py) & [`dev/frontend/src/features/handover/HandoverPanel.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/features/handover/HandoverPanel.jsx)
- **Giải pháp & Kết quả tối ưu**:
  1. **Frontend**: Sửa `useEffect` trong `HandoverPanel.jsx` bỏ `state` khỏi dependency array $\rightarrow$ triệt tiêu việc gọi lặp kép 2 lần API `/deliverables`.
  2. **Backend**: Viết lại hàm `_chia_vai_ban_giao` trong `handover.py` thành 1 câu SQL kết hợp `EXISTS (...)` kiểm tra quyền `finance.create` trực tiếp $\rightarrow$ triệt tiêu hoàn toàn vòng lặp N+1 queries.
  3. **Backend**: Tái sử dụng `node.get("service_line_id")` trong `tai_lieu_ban_giao` $\rightarrow$ loại bỏ câu query join thừa thứ 2.

---

### 🔴 BUG-08: Ghi nhận thu tiền bị khoá theo bước bàn giao — màn Thu Công Nợ giấu mất hợp đồng còn nợ
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`dev/backend/src/dossiers/handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/dossiers/handover.py) · [`routes_handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_handover.py) · [`finance/services.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/finance/services.py) · [`DebtCollection.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/DebtCollection.jsx) · [`CashflowModal.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/modals/CashflowModal.jsx)
- **Nguyên nhân gốc**:
  - Tiền được gắn vào **bước bàn giao (task_node)** chứ không gắn vào **hợp đồng**. Ba hệ quả:
    1. `record_payment` chặn `409` khi node đã đóng → khách trả nốt sau khi bàn giao xong thì không ghi được.
    2. `outstanding_handovers()` lọc `where n.status not in ('cancelled','skipped','accepted','pending')` → hợp đồng chưa chạy tới bước bàn giao, hoặc quy trình không khai bước bàn giao nào, **biến mất khỏi màn Thu Công Nợ** dù vẫn còn nợ.
    3. Kế toán mở đúng màn hình của mình mà không thấy khoản phải đòi.
  - Ngoài ra: màn Thu Công Nợ **bắt buộc đính bill**, còn phiếu thu ở Sổ Quỹ **không có ô đính bill** → chặt một đường, hở một đường, ai muốn né chứng từ chỉ cần lập phiếu bên Sổ Quỹ.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — Quyết định nghiệp vụ do anh Huy duyệt: *"Ghi nhận tiền theo hợp đồng — thu lúc nào cũng được"* + *"Màn Thu Công Nợ hiện mọi hợp đồng còn nợ"*.
  > - **Người ghi nhận không đổi**: vẫn chỉ kế toán (`finance.create`), vẫn bắt buộc bill, phiếu vẫn vào *Chờ duyệt*. Chỉ đổi **lúc nào được ghi**.
  > - Tách lõi `_ghi_nhan_thu_tien()`; thêm `record_contract_payment()` + route `POST /api/handover/contracts/{contract_id:path}/payments` (dùng `:path` vì mã hợp đồng có dấu `/`).
  > - Bỏ chặn `409 "Node đã đóng"`; `can_record_payment` nay phụ thuộc **công nợ + quyền**, không phụ thuộc trạng thái node.
  > - Viết lại `outstanding_handovers()` đi từ bảng `contracts`, `LEFT JOIN LATERAL` sang bước bàn giao (có thì hiện người giao / trạng thái giao, không có vẫn hiện vì tiền vẫn nợ).
  > - Chặn thu tiền **gắn hợp đồng** ở Sổ Quỹ kèm câu chỉ đường; thu không gắn hợp đồng (lãi ngân hàng, thu khác) vẫn lập bình thường. Form hiện ghi chú **trước** khi bấm Lưu.
  > - **Kiểm chứng trên data thật**: trước khi sửa danh sách chỉ ra 1 dòng; sau khi sửa ra **cả 3 hợp đồng đang nợ 67.800.000₫** (002 và 003 trước bị giấu vì node bàn giao còn `pending`). Chặn: vượt công nợ → `400` kèm số còn thiếu; thiếu bill → `422`; hợp đồng không tồn tại → `404`; không token → `401`. `npx vitest run` 43/43.

---

### 🔴 BUG-09: Kế toán gửi phiếu thu — giám đốc không nhận thông báo, kế toán không thấy dấu vết
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`routes_notifications.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_notifications.py) · [`routes_handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_handover.py) · [`routes_finance.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_finance.py) · [`handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/dossiers/handover.py) · [`App.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/App.jsx) · [`Cashflow.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Cashflow.jsx) · [`CashflowScreen.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/screens/CashflowScreen.jsx) · [`NotificationBell.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/NotificationBell.jsx) · [`DebtCollection.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/DebtCollection.jsx)
- **Nguyên nhân gốc**:
  1. `/api/notifications/summary` chỉ có 5 nguồn (nghiệm thu node, checklist chờ duyệt, việc mới, checklist bị trả, hồ sơ pháp lý) — **không có nguồn nào cho phiếu thu/chi chờ duyệt**. Gọi API lúc đang có phiếu 500.000₫ chờ duyệt: trả về `count: 0`.
  2. Chuông chạy bằng SSE, chỉ refresh khi backend `publish_timeline_change`. Toàn bộ đường tiền (ghi nhận / duyệt / từ chối) **chưa bao giờ phát tín hiệu** → phải F5 mới thấy.
  3. Màn Thu Công Nợ chỉ tính tiền **đã duyệt** → kế toán gửi xong nhìn màn hình y hệt lúc chưa gửi, tưởng hệ thống nuốt mất phiếu.
  4. Câu `insert` phiếu thu ở `handover.py` thiếu cột `created_at` → phiếu không có giờ gửi, không sắp xếp được theo thứ tự hàng chờ.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa**
  > - Thêm `_MANAGER_CASHFLOW_APPROVAL_QUERY` — nguồn thông báo mới, **chỉ hiện với người có `finance.approve`**, bám theo bước bàn giao của hợp đồng để bấm vào là mở đúng chỗ.
  > - Bấm thông báo → `bachkhoa:open-cashflow-voucher` → `Cashflow.jsx` chuyển sang Sổ Nhật Ký + `CashflowScreen` mở thẳng modal phiếu (modal tự tải theo mã phiếu nên không phụ thuộc bộ lọc tháng / hình thức thanh toán).
  > - `publish_timeline_change` ở cả 3 mốc: kế toán gửi phiếu, giám đốc duyệt, giám đốc từ chối → chuông kêu ngay và tự bỏ dòng khi duyệt xong.
  > - Trả thêm `pending` trong `outstanding_handovers()`; thẻ công nợ hiện dòng xanh *"X₫ đã gửi, chờ Giám đốc duyệt — duyệt xong mới trừ công nợ"*.
  > - Thêm `created_at = now()` vào câu insert phiếu thu.
  > - **Kiểm chứng vòng khép kín**: gửi 500.000₫ → chuông giám đốc 1 mục (link đúng node k08) → màn kế toán hiện "chờ duyệt" → giám đốc duyệt → chuông về 0 → công nợ 12.300.000 → 11.800.000. Dọn sạch phiếu test sau khi kiểm.

---

### 🔴 BUG-11: Cache Redis không bị xoá khi tiền thay đổi — màn công nợ hiện số cũ tới 2 phút
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`core/redis_utils.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/redis_utils.py) · [`routes_finance.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_finance.py) · [`routes_handover.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_handover.py) · [`routes_contracts.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_contracts.py)
- **Nguyên nhân gốc**:
  - Phiên tối ưu của JARVIS thêm cache Redis cho `finance/contracts`, `receivables`, `payables`, `advance` (TTL 120s) và `monthly_dashboard` (TTL 60s), nhưng **chỉ `advance/create`, `advance/clear`, `payroll`, `settings` gọi `invalidate_cache`**.
  - Các route đổi tiền **không xoá cache**: `cashflow/create`, `cashflow/{id}` (PUT), `void`, `approve`, `reject`, ghi nhận thu tiền ở bàn giao, `write-off-debt`, `carry-forward-debt`, `override-handover`.
  - **Tái hiện được**: duyệt phiếu 700.000₫ → DB `receivables` = `700.000 / 11.600.000`, nhưng `GET /api/finance/receivables` vẫn trả `0 / 12.300.000`. Giám đốc bấm duyệt xong mở màn công nợ vẫn thấy số cũ — đúng triệu chứng "hệ thống nuốt mất phiếu".
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa**
  > - Thêm `invalidate_money_caches()` trong `redis_utils.py`: xoá cùng lúc `bachkhoa:finance:*`, `bachkhoa:contract_workspace:*`, `bachkhoa:contracts:*` — vì một đồng đổi chỗ là kéo theo cả trạng thái hợp đồng (`Xong, còn nợ` ↔ `Hoàn thành`).
  > - Gọi ở **mọi** điểm đổi tiền: tạo / sửa / huỷ / duyệt / từ chối phiếu, ghi nhận thu tiền ở bàn giao, xoá nợ, chuyển nợ, duyệt cho nợ.
  > - **Kiểm chứng lại**: nạp cache (700.000) → lập phiếu 300.000 → duyệt → API trả ngay `1.000.000 / 11.300.000`. Dọn sạch phiếu test, `receivables` trả về `0 / 12.300.000`.

---

### 🔴 BUG-12: `invalidate_cache` được gọi 11 chỗ nhưng không import — `NameError` ở các luồng lõi
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`routes_contracts.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/routes/routes_contracts.py#L35)
- **Nguyên nhân gốc**:
  - Dòng import chỉ có `get_cached_json, set_cached_json, redis_distributed_lock`, thiếu `invalidate_cache` — trong khi hàm này được gọi ở **11 vị trí**: lưu nháp quy trình, kích hoạt bản mới, huỷ quy trình, lưu bố cục, phân công nhân sự, duyệt checklist, nghiệm thu bước.
  - Module vẫn import được (lỗi chỉ nổ lúc chạy) nên không lộ ra khi khởi động — bấm Lưu nháp là `500`.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — bổ sung `invalidate_cache` vào khối import; xác nhận bằng `importlib` trong container: cả 4 tên (`invalidate_cache`, `invalidate_money_caches`, `get_cached_json`, `redis_distributed_lock`) đều resolve OK.

---

### 🟡 BUG-13: Màn Lập Phiếu gọi API không kèm token — không ra số chứng từ, không có phòng ban
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`PrintVoucherScreen.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx)
- **Nguyên nhân gốc**:
  - Phiên chuẩn hoá `apiFetch` bỏ sót 2 lời gọi còn dùng `fetch` trần: `/api/finance/departments` và `/api/finance/next-voucher-id`. Cả hai route đều `require_permission("finance", ...)`.
  - **Đã gọi thử không kèm token: cả hai trả `401`** → dropdown phòng ban rỗng, ô số chứng từ để trống, kế toán không lập được phiếu.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — chuyển cả hai sang `apiFetch` (tự đính `Authorization`), bỏ khối `res.ok` thừa. Đã quét lại toàn bộ `dev/frontend/src/components/finance/`: không còn `fetch` trần nào ngoài `ReceiptLinks.jsx` (chỗ này cố ý tự gắn header để đọc ảnh nhị phân).

---

### 🟡 BUG-14: `/api/config` trả payload thiếu khoá là trang Hợp Đồng trắng màn hình
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`Contracts.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Contracts.jsx#L91) · [`Contracts.document.test.jsx`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/frontend/src/pages/Contracts.document.test.jsx)
- **Nguyên nhân gốc**:
  - `fetchConfig` đổi từ `fetch` sang `apiFetch` và gán thẳng `setConfig(data)`, mất mặc định `{ personnel: [], services: [] }`. Payload thiếu `services` → `config.services.map()` ném `TypeError: Cannot read properties of undefined` → **cả trang hợp đồng trắng**.
  - Lộ ra qua 2 test đỏ trong `Contracts.document.test.jsx`.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa**
  > - `setConfig` nay ép kiểu mảng cho từng khoá, payload thiếu gì cũng không làm gãy trang.
  > - Sửa luôn test: mock `apiFetch` **định tuyến theo URL** thay vì trả chung một payload cho mọi lời gọi (trước đây payload "tạo tài liệu" bị nhét vào chỗ config và danh sách hợp đồng).
  > - `npx vitest run`: **43/43 xanh**.

---

### 🟡 BUG-15: Cache workspace hợp đồng không ghi được dòng nào — tối ưu "0ms" thực chất không chạy
- **Trạng thái**: `[x] Đã sửa`
- **File đã sửa**: [`core/redis_utils.py`](file:///Users/macos/WIFIM/bachkhoa-erp/dev/backend/src/core/redis_utils.py#L52)
- **Nguyên nhân gốc**:
  - `set_cached_json` dùng `json.dumps(data)` trần, trong khi payload workspace chứa `datetime` (và có chỗ `Decimal`, `UUID`) → ném `TypeError: Object of type datetime is not JSON serializable`.
  - Lỗi bị nuốt vào `logger.warning` rồi `return False`, **không ai thấy** → tưởng đã có cache Redis 60s, thực tế **mọi request vẫn xuống thẳng DB**.
  - **Bằng chứng**: log backend đếm được **20 dòng** `not JSON serializable`; `redis-cli --scan` pattern `bachkhoa:contract_workspace:*` trả về **rỗng**.
- **Ghi chú của Claude sau khi sửa**:
  > **[x] Đã sửa** — cho `set_cached_json` đi qua `fastapi.encoders.jsonable_encoder` trước khi `json.dumps`. Đây đúng là encoder FastAPI dùng để trả response nên dữ liệu đọc từ cache khớp từng kiểu với dữ liệu trả thẳng từ DB.
  > - **Kiểm chứng**: gọi lần 1 `0.68s` → lần 2 `0.20s`; khoá `bachkhoa:contract_workspace:001/BK-2026:{user_id}` đã có trong Redis; log lỗi serialize về **0**.
  > - **So khớp dữ liệu**: lấy payload từ cache, xoá khoá, lấy lại payload từ DB → `giống hệt nhau: True`.
