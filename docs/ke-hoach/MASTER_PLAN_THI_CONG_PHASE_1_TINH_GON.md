# 🚀 MASTER BLUEPRINT: HƯỚNG DẪN THI CÔNG CHI TIẾT DÀNH CHO CODEX
## DỰ ÁN: BÁCH KHOA ERP — PHASE 1: SƠ ĐỒ QUY TRÌNH GIÁM ĐỐC & BỂ VIỆC SĂN KHOÁN NHÂN VIÊN

> **Dành cho:** AI Coding Agent (Codex / Antigravity)  
> **Triết lý cốt lõi:** **Admin/Giám đốc Setup Quy trình & Thời hạn (SLA) ➔ Bắn vào Bể việc (Task Pool) ➔ Nhân viên tự Săn khoán theo Ca ➔ Sếp Duyệt nghiệm thu & Giải ngân khoán tức thì.**  
> **Phong cách UI:** Sang trọng, Tinh tế, Mềm mại (Soft Modern ERP Glassmorphism), Tuyệt đối không chữ rác li ti (Zero-Clutter).  
> **Phong cách tài liệu:** Step-by-step, Cấu trúc rõ ràng, File-by-File, Dễ đọc - Dễ hiểu - Dễ thi công 1000%.

---

## 📑 MỤC LỤC
1. [Bảng Tra Cứu Thay Đổi (AS-IS vs TO-BE)](#-chương-1-bảng-tra-cứu-thay-đổi-as-is-vs-to-be)
2. [Triết Lý Vận Hành: Setup Quy Trình vs Bể Việc Săn Khoán](#-chương-2-triết-lý-vận-hành-setup-quy-trình-vs-bể-việc-săn-khoán)
3. [Quy Tắc Nghiệp Vụ Node K08 (Bàn Giao & Duyệt Nợ Liên Phòng Ban)](#-chương-3-quy-tắc-nghiệp-vụ-node-k08-bàn-giao--duyệt-nợ-liên-phòng-ban)
4. [Kiến Trúc Tối Ưu Hiệu Năng Với Redis (< 5ms & Zero-Polling)](#-chương-4-kiến-trúc-tối-ưu-hiệu-năng-với-redis--5ms--zero-polling)
5. [Quy Chuẩn Thiết Kế Bố Cục UI/UX (Admin Workflow & Employee Workspace)](#-chương-5-quy-chuẩn-thiết-kế-bố-cục-uiux-admin-workflow--employee-workspace)
6. [5 Thuật Toán & Khóa Nguyên Tử Cốt Lõi](#-chương-6-5-thuật-toán--khóa-nguyên-tử-cốt-lõi)
7. [Hướng Dẫn Thi Công Từng File (File-by-File Guide)](#-chương-7-hướng-dẫn-thi-công-từng-file)
8. [Kịch Bản Kiểm Thử E2E (Test Suite)](#-chương-8-kịch-bản-kiểm-thử-e2e)

---

# 📌 CHƯƠNG 1: BẢNG TRA CỨU THAY ĐỔI (AS-IS vs TO-BE)

| # | Hạng mục | ❌ CODE HIỆN TẠI (AS-IS) | ✅ CODEX CẦN THI CÔNG (TO-BE) |
| :---: | :--- | :--- | :--- |
| **1** | **Cơ chế Phân việc** | Giám đốc phải ngồi gán cứng tên từng người vào từng Node. | **Hybrid Claim & Pool**: Giám đốc setup Quy trình + SLA thời hạn cho phép ➔ Node `READY` tự động đẩy vào **Bể việc chung (`task-pool`)** ➔ Thợ tự bấm Nhận việc (hoặc Giám đốc chỉ định nếu đặc thù). |
| **2** | **UI Node Inspector** | Hiện badge giả định runtime lộn xộn, nhiều chữ chú thích rác li ti. | **Sạch sẽ, Tinh gọn (Zero-Clutter)**: Giám đốc setup SLA `[ 1 ] ngày [ 0 ] giờ`, chọn vai trò nhận việc, checklist đầu ra, không chữ thừa. Dropdown phòng ban nền đặc 100% chuẩn custom. |
| **3** | **Bố cục Dashboard Nhân Viên** | Lỗi Grid: Lịch FullCalendar bị ép chui vào sidebar hẹp 300px bên phải, làm co dúm và cắt chữ; sidebar nghỉ phép bị tụt xuống đáy. | **Bố cục 2 Cột chuẩn Dashboard ERP**: <br>• **Cột chính (75% bên trái)**: Gồm Bể việc + Việc đang làm + Lịch tuần rộng rãi full-width không bị cắt chữ.<br>• **Cột phụ (25% bên phải)**: Sidebar Nghỉ phép, Tin tức, Liên kết nhanh. |
| **4** | **Đóng Node K08 (Bàn Giao)** | Chưa tự động liên kết với duyệt checklist và tiền thu. | **2 Điều kiện tự động**: <br>1. Toàn bộ checklist K08 được duyệt ➔ Tự tích xanh **Giao hồ sơ**.<br>2. Tiền thu đủ 100% (hoặc có Đơn xin duyệt nợ được Giám đốc duyệt) ➔ Mở khóa đóng K08. |
| **5** | **Hiệu năng & Cache** | Query CSDL liên tục, polling `setInterval` làm đơ máy. | **Redis Cache (< 5ms)** cho Bể việc + **SSE Real-time Event** (triệt tiêu 100% polling spam). |
| **6** | **Tranh chấp 2 người nhận 1 lúc** | Không có khóa, thợ bấm trùng đè việc lên nhau. | **Redis Distributed Lock + Atomic SQL (`WHERE assigned_employee_id IS NULL`)**: Người nhanh hơn 1ms nhận việc, người sau nhận Toast thông báo nhẹ nhàng. |
| **7** | **Gói Đo Vẽ & Hạn Mức Tải** | Thợ chỉ nhận đo K02 rồi bỏ dở K03 Cad, hoặc nhận tràn lan. | **Trọn Gói Đo Vẽ + Khóa Tải WIP Limit = 3**: <br>• Thợ chính nhận K02 bắt buộc tự làm tiếp K03 Cad.<br>• Slot Thợ phụ K02 vẫn mở trên Bể việc (chỉ nhận được khi ca chưa xuất phát); không ai nhận phụ ➔ không chi thêm khoán phụ.<br>• Nhận tối đa 3 hạng mục dở dang, nếu không nộp các node tiếp theo ➔ Khóa cứng Bể việc. |
| **8** | **Đo nhiều ca/ngày** | Bị kẹt cứng 1 việc/ngày. | **Cuốn chiếu liên hoàn**: Bấm Nộp Ca 1 ➔ Mở khóa nhận tiếp Ca 2, Ca 3 trong ngày. |
| **9** | **Túi hồ sơ kế thừa** | File phân tán, người sau phải đi xin lại file. | **Kế thừa tự động**: Duyệt K02 ➔ File mốc/tọa độ tự động chuyển sang K03 vẽ Cad; duyệt K03 chuyển sang K05/K06 Pháp lý ➔ K08 Bàn giao. |
| **10** | **Quay ngược bước (Rollback)** | VPĐK trả hồ sơ không biết lùi bước thế nào. | **Cascade Reset**: Tại K06 chọn lùi về K03 (vẽ lại) hoặc K02 (đo lại) ➔ Hệ thống tự động reset các bước trung gian và đẩy ca sửa đổi vào Bể việc. |

---

# ⚙️ CHƯƠNG 2: TRIẾT LÝ VẬN HÀNH: SETUP QUY TRÌNH VS BỂ VIỆC SĂN KHOÁN

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              VÒNG ĐỜI VẬN HÀNH KHOÁN & BỂ VIỆC (TASK POOL LIFECYCLE)                                   │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 👑 1. ADMIN / GIÁM ĐỐC SETUP QUY TRÌNH (Workflow Designer):                                                            │
│    • Kéo thả các bước: K01 ➔ K02 ➔ K03 ➔ K06 ➔ K08.                                                                    │
│    • Thiết lập Thời hạn xử lý (SLA Target): Cho phép node này hoàn thành trong bao lâu (VD: 1 ngày 0 giờ, hoặc 4 giờ). │
│    • Thiết lập Vai trò / Phòng ban nhận việc: Thợ đo hiện trường, Kỹ thuật vẽ Cad, Pháp lý, Bàn giao.                 │
│    • Thiết lập Checklist minh chứng cần nộp & Tiền khoán / Điểm KPI.                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🚀 2. KÍCH HOẠT QUY TRÌNH ➔ ĐẨY VÀO BỂ VIỆC (`task-pool`):                                                             │
│    • Node bắt đầu (K01) mở ra ở trạng thái `READY` ➔ Bắn vào Bể việc của Phòng ban tương ứng.                          │
│    • Cache Redis `task_pool:<dept_id>` được làm mới tức thì (< 5ms).                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 👤 3. NHÂN VIÊN SĂN VIỆC (Employee Portal Dashboard):                                                                  │
│    • Nhân viên mở Bàn làm việc ➔ Xem danh sách việc trong Bể việc.                                                     │
│    • Bấm [ 🚀 Nhận việc ]: Hệ thống kiểm tra WIP Limit (nợ Cad < 3) ➔ Lock nguyên tử ➔ Nhận việc & Bấm giờ Live Timer. │
│    • Nhân viên thực hiện xong ➔ Upload file minh chứng ➔ Bấm [ ⏹️ Nộp nghiệm thu ].                                     │
│    • Tài khoản mở khóa ngay lập tức để tiếp tục nhận ca tiếp theo trong ngày (Cuốn chiếu liên hoàn).                   │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 💎 4. DUYỆT NGHIỆM THU & BẮN TIỀN KHOÁN (Acceptance & Pay Entitlements):                                               │
│    • Giám đốc / Trưởng phòng duyệt đạt ➔ Tiền khoán & KPI được ghi nhận ngay vào bảng lương.                           │
│    • Node tiếp theo tự động chuyển `READY` ➔ Kế thừa túi hồ sơ từ node trước ➔ Bắn tiếp vào Bể việc!                  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 🏢 CHƯƠNG 3: QUY TẮC NGHIỆP VỤ NODE K08 (BÀN GIAO & DUYỆT NỢ LIÊN PHÒNG BAN)

Node **K08 (Bàn Giao & Thu Tiền)** là bước chốt của toàn bộ Hợp đồng, có sự phối hợp giữa **Nhân viên Đo vẽ/Pháp lý (Giao tài liệu)** và **Bộ phận Kế toán/Thu ngân (Cổng công nợ)**.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              2 ĐIỀU KIỆN TIÊN QUYẾT ĐỂ HOÀN THÀNH NODE K08 (BÀN GIAO)                                   │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 ĐIỀU KIỆN 1: GIAO HỒ SƠ CHO KHÁCH (Delivery Condition):                                                             │
│    • Nhân viên bàn giao tải trọn bộ hồ sơ (kế thừa từ K02, K03, K06) đi giao cho khách hàng.                           │
│    • Nộp các minh chứng bàn giao (Biên bản bàn giao có chữ ký, ảnh chụp bàn giao mốc ranh).                           │
│    • 🟢 TỰ ĐỘNG TÍCH XANH (✓): Khi TOÀN BỘ checklist minh chứng của K08 đã được Giám đốc duyệt đạt 100%!               │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 💰 ĐIỀU KIỆN 2: THU ĐỦ TIỀN HỢP ĐỒNG HOẶC DUYỆT NỢ (Financial Gate Condition):                                         │
│    • TRƯỜNG HỢP A (Đã thu đủ 100%):                                                                                    │
│      - Tổng phiếu thu đã duyệt == Giá trị hợp đồng (Công nợ = 0 đ) ➔ 🟢 TỰ ĐỘNG TÍCH XANH (✓).                        │
│    • TRƯỜNG HỢP B (Khách hàng còn nợ tiền):                                                                            │
│      - Công nợ > 0 đ ➔ Cổng công nợ khóa không cho đóng K08.                                                           │
│      - Nhân viên bàn giao phải bấm [ 📝 Lập đơn xin duyệt bàn giao khi còn nợ ] (Nhập lý do: VD khách hẹn chuyển khoản).│
│      - Giám đốc / Admin bấm [ 🛡️ Duyệt nợ ] ➔ Mở khóa cổng công nợ cho K08 (Công nợ vẫn ghi nhận trong sổ kế toán).   │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🏁 KẾT THÚC HỢP ĐỒNG:                                                                                                 │
│    Khi cả ĐIỀU KIỆN 1 và ĐIỀU KIỆN 2 đều đạt (✓) ➔ Bấm [ Hoàn tất quy trình Hợp đồng ] ➔ Trạng thái HĐ chuyển 'COMPLETED'│
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# ⚡ CHƯƠNG 4: KIẾN TRÚC TỐI ƯU HIỆU NĂNG VỚI REDIS (< 5MS & ZERO-POLLING)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 1. REDIS CACHE BỂ VIỆC (`task_pool:<dept_id>`):                                                                     │
│    • Key: `task_pool:{dept_id}` (hoặc `task_pool:all`). TTL = 60 giây.                                                 │
│    • Phục vụ hàng trăm nhân viên tải Bể việc với độ trễ < 5ms.                                                         │
│    • Invalidation: Khi có sự kiện `claim`, `submit`, `accept` ➔ Gọi `invalidate_cache("task_pool:*")`.                 │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔒 2. KHÓA PHÂN TÁN REDIS (Distributed Lock):                                                                          │
│    • Bọc thao tác nhận việc: `with redis_distributed_lock(f"lock:claim:{node_id}", timeout=5):`.                       │
│    • Phối hợp với SQL Atomic: `UPDATE task_node_assignments SET assigned_employee_id = %s WHERE ... IS NULL`.        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📡 3. REAL-TIME EVENT-DRIVEN SSE (CHẶT ĐỨT 100% POLLING RÁC):                                                          │
│    • Event Stream: `TASK_CLAIMED`, `TASK_SUBMITTED`, `TASK_ACCEPTED`, `WORKFLOW_UPDATED`.                             │
│    • Frontend chỉ fetch lại data khi nhận được Event SSE. TUYỆT ĐỐI KHÔNG DÙNG `setInterval` 1s/2s.                   │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 🎨 CHƯƠNG 5: QUY CHUẨN THIẾT KẾ BỐ CỤC UI/UX (ADMIN WORKFLOW & EMPLOYEE WORKSPACE)

### 💎 1. Màn Hình Giám Đốc (ContractWorkflowDesigner):
- **Header Dải Tiến Độ 1 Dòng (Compact Pill)**:
  `BẮT ĐẦU 17:00 · 19/8  →  KẾT THÚC 08:25 · 20/8  │  XỬ LÝ 0g 00p  │  1/1 bước ━━━━━━━━━━ 100%`
- **Right Inspector Panel (Node Tab Tinh Gọn - Zero Clutter)**:
  1. **Thẻ Đội ngũ / Bể việc**: Dropdown chọn Phòng ban dạng **CustomSelect nền đặc 100% (không trong suốt)**, item chọn có nền cam đào pastel `#fff7ed` và checkmark cam `✓`. Không render chữ placeholder vô nghĩa trong list.
  2. **Thời hạn xử lý (SLA Target)**: `[ 1 ] ngày [ 0 ] giờ` (kể từ khi thợ nhận việc).
  3. **Khối ĐẦU RA NGHIỆM THU**: Card xám ấm `#f8fafc` bo góc mềm mại, text rõ ràng.
  4. **Khối ĐIỀU KIỆN KÍCH HOẠT**: 3 Checkbox tinh gọn (Nộp cơ quan, Bước đo vẽ, Bước bàn giao), **không chữ giải thích li ti**.
  5. **Nút viền đứt**: `(✓) Đặt làm node bắt đầu`.

---

### 🖥️ 2. Màn Hình Nhân Viên (Employee Portal Workspace — Khắc Phục Lỗi Layout Grid):

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 👤 CHÀO BUỔI SÁNG, NGUYỄN VĂN A                                                                               [ 🔴 Check-out / Đã Check-in ] │
│    🟢 Trạng thái: Đang làm việc (Online) - Nhân viên đo vẽ                                                                             │
├──────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 🖥️ CỘT CHÍNH (MAIN WORKSPACE - 75%): Bọc trong `.employee-workspace__main`               │ 📁 CỘT PHỤ (SIDEBAR - 25% — 300px)          │
│                                                                                          │                                             │
│ 🔵 BỂ VIỆC SẴN SÀNG NHẬN (TaskPoolPanel — Hiển Thị Mã Bước K & Checklist Đầu Ra) ───────── │ 📅 THÔNG TIN NGHỈ PHÉP ──────────────────── │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │ • Phép năm còn lại: 12 / 14 ngày            │
│ │ 📐 [K02] ĐO ĐẠC HIỆN │ │ 🤝 [K02] PHỤ ĐO ĐẠC  │ │ ⚡ [K03] CAD FAST-TRAC │ │ 🏛️ [K06] NỘP MỘT CỬA │ │ • Đã nghỉ trong năm: 2 ngày                 │
│ │ HĐ 014 · Khách: Tuấn │ │ HĐ 016 · Khách: Minh │ │ HĐ 015 · Khách: Nam  │ │ HĐ 009 · Khách: Oanh │ │ [ + Tạo đơn nghỉ phép ]                     │
│ │ 📍 P. Tân Phong, Q.7 │ │ 📍 Xã Hiệp Phước, NB │ │ 📍 P. Thảo Điền, Q.2 │ │ 📍 81 Tân Phú, Q.7    │ ├─────────────────────────────────────────────┤
│ │ 📋 CHECKLIST BẮT BUỘC│ │ 📋 CHECKLIST PHỤ ĐO: │ │ 📋 CHECKLIST BẮT BUỘC│ │ 📋 CHECKLIST BẮT BUỘC: │ 📢 TIN TỨC & THÔNG BÁO ──────────────────── │
│ │  ☑️ 4 ảnh GPS mốc ranh│ │  ☑️ Cầm gương/cọc mốc│ │  ☑️ File CAD .dwg gốc│ │  ☑️ Ảnh chụp Phiếu hẹn │ │ 🔵 Thông báo nộp hồ sơ trước 16h30        │
│ │  ☑️ File tọa độ .csv │ │  ☑️ Phụ chụp ảnh mốc │ │  ☑️ 4 bản vẽ PDF     │ │  ☑️ Mã Biên nhận & Hẹn │ │ 🟢 Cập nhật mẫu biên bản bàn giao K08       │
│ │ 💰 Khoán: 250k (Phụ:1│ │ 💰 Khoán phụ: 100k   │ │ 💰 Khoán: 200k  KPI:10│ │ 💰 Khoán: 100k  KPI:05│ │ 🔴 Hạn chót nghiệm thu bản vẽ tháng 8      │
│ │ [🚀 Chính] [🤝 Phụ]  │ │  [ 🤝 Nhận Thợ Phụ]  │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận Đi Nộp ] │ │ 🟡 Quy định an toàn máy đo RTK ngoài trời │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ ├─────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │ 🔗 LIÊN KẾT NHANH ───────────────────────── │
│ │ 📍 [K02] CẮM MỐC RANH│ │ 🔥 [K03] SỬA BẢN CAD │ │ 📐 [K02] ĐO TÁCH THỬA│ │ 🤝 [K08] BÀN GIAO SỔ │ │ • [ 📖 Sổ tay quy trình kỹ thuật ]          │
│ │ HĐ 018 · Khách: Dũng │ │ HĐ 015 · Sửa lộ giới │ │ HĐ 017 · Khách: Cường│ │ HĐ 008 · Khách: Phát │ • [ 👥 Danh bạ & Sơ đồ tổ chức ]            │
│ │ 📍 Xã Phước Kiển, NB │ │ 📍 P. Thảo Điền, Q.2 │ │ 📍 P. Bình An, Q.2   │ │ 📍 P. Tân Thuận, Q.7 │ • [ 💰 Bảng kê quyết toán khoán ]           │
│ │ 📋 CHECKLIST BẮT BUỘC│ │ 📋 CHECKLIST SỬA:    │ │ 📋 CHECKLIST BẮT BUỘC│ │ 📋 CHECKLIST BẮT BUỘC: │ • [ ⚡ Bảng kê quyết toán khoán ]           │
│ │  ☑️ Chôn 4 cọc mốc sắt│ │  ☑️ Cập nhật hẻm 6m  │ │  ☑️ Đo toàn bộ ranh  │ │  ☑️ Kế toán duyệt phí  │ └─────────────────────────────────────────────┘
│ │  ☑️ Biên bản giao mốc│ │  ☑️ Xuất lại 4 bản in│ │  ☑️ File tọa độ tách │ │  ☑️ Ký Biên bản giao sổ│
│ │ 💰 Khoán: 300k  KPI:1│ │ 💰 Khoán: 100k (Gấp) │ │ 💰 Khoán: 300k  KPI:1│ │ 💰 Khoán: 100k  KPI:05│
│ │   [ 🚀 Nhận việc ]   │ │  [ 🔥 Nhận Sửa Ngay] │ │   [ 🚀 Nhận việc ]   │ │   [ 🚀 Nhận Bàn Giao]│
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘
│                                                                                          │                                             │
│ 🔴 VIỆC ĐANG LÀM & TỔNG KẾT HÔM NAY (ActiveWorkStrip + DailySummary) ─────────────────── │                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ ┌───────────────────┐ │                                             │
│ │ ⏱ 01:45:12  HĐ 015 · Đang vẽ CAD (Dùng Trích Lục VPĐK)          │ │ ✓ 2 ca đã nộp   │ │                                             │
│ │ [ 📄 Xem file trích lục gốc ]    👉 [ ⏹️ Nộp bản vẽ CAD .dwg ]    │ │ ⏱ 1 đang làm    │ │                                             │
│ │                                                                 │ │ 💰 550.000 đ khoán│ │                                             │
│ └─────────────────────────────────────────────────────────────────┘ └───────────────────┘ └─────────────────────────────────────────────┘
│                                                                                                                                        │
│ 📅 LỊCH LÀM VIỆC & PHÂN BỔ CA TUẦN NÀY (FullCalendar > 1000px) ──────────────────────────────────────────────────────────────────────── │
│ ┌────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬─────────────────────┐ │
│ │        │    THỨ HAI     │     THỨ BA     │     THỨ TƯ     │    THỨ NĂM     │    THỨ SÁU     │    THỨ BẢY     │      CHỦ NHẬT       │ │
│ │        │   17/08/2026   │   18/08/2026   │   19/08/2026   │   20/08/2026   │   21/08/2026   │   22/08/2026   │     23/08/2026      │ │
│ ├────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼─────────────────────┤ │
│ │ SÁNG   │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │                │                     │ │
│ │ (07:00)│ │📐 K02 Đo đạc │ │ │🏛️ K06 Nộp VP│ │ │📐 K02 Cắm mốc│ │ │📐 K02 Đo đạc │ │ │🏛️ K06 Nộp VP│ │                │                     │ │
│ │        │ │HĐ 012 · Q.7  │ │ │ĐK Q.7 HĐ 009│ │ │Nhà Bè HĐ 016 │ │ │Bình Chánh    │ │ │ĐK Q.2 HĐ 010│ │                │                     │ │
│ │        │ │07:30 - 11:00 │ │ │08:00 - 10:30│ │ │07:30 - 11:30 │ │ │07:30 - 11:00 │ │ │08:00 - 10:00│ │                │                     │ │
│ │        │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │                │                     │ │
│ ├────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼─────────────────────┤ │
│ │ CHIỀU  │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │                │                     │ │
│ │ (13:00)│ │💻 K03 Vẽ CAD │ │ │💻 K03 Vẽ CAD │ │ │⚖️ K04 Soạn HS│ │ │💻 K03 Vẽ CAD │ │ │🤝 K08 Giao sổ│ │                │                     │ │
│ │        │ │HĐ 012        │ │ │HĐ 015        │ │ │kỹ thuật HĐ016│ │ │HĐ 018        │ │ │HĐ 008        │ │                │                     │ │
│ │        │ │13:30 - 16:30 │ │ │13:30 - 16:00 │ │ │13:30 - 15:30 │ │ │13:30 - 16:30 │ │ │14:00 - 16:00 │ │                │                     │ │
│ │        │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └────────────┘ │                │                     │ │
│ │        │                │ ┌────────────┐ │                │ ┌────────────┐ │                │                │                     │ │
│ │        │                │ │🔍 K05 Thẩm tra│ │                │ │🤝 K08 Giao sổ│ │                │                │                     │ │
│ │        │                │ │nội bộ HĐ 011 │ │                │ │HĐ 006        │ │                │                │                     │ │
│ │        │                │ │16:00 - 17:00 │ │                │ │16:30 - 17:30 │ │                │                │                     │ │
│ │        │                │ └────────────┘ │                │ └────────────┘ │                │                │                     │ │
│ └────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### ⚠️ LƯU Ý KỸ THUẬT SỬA LỖI GRID CHO CODEX:
- **Nguyên nhân lỗi cũ**: `EmployeeWorkspaceCalendar.jsx` trả về Fragment `<>` gồm 2 thẻ con độc lập (`.employee-workspace-operations` và `.employee-workspace-calendar`). Trong CSS Grid 2 cột, bảng Lịch tuần bị nhảy sang Cột 2 (cột 300px), khiến lịch bị co dúm và Sidebar bị đẩy xuống đáy Cột 1.
- **Giải pháp bắt buộc**:
  - `EmployeeWorkspaceCalendar.jsx` phải trả về thẻ bọc duy nhất: `<div className="employee-workspace__main"> ... </div>`.
  - CSS `.employee-workspace` định nghĩa: `display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px;`.
  - CSS `.employee-workspace__main` định nghĩa: `display: flex; flex-direction: column; gap: 14px; width: 100%; min-width: 0;`.
  - CSS `.employee-workspace-calendar` định nghĩa: `width: 100%; min-width: 0; border-radius: 12px; overflow: hidden;`.

---

# 🛠️ CHƯƠNG 6: 5 THUẬT TOÁN & KHÓA NGUYÊN TỬ CỐT LÕI

### 1. Thuật toán Nhận Việc Nguyên Tử (Atomic Claim):
```python
with redis_distributed_lock(f"lock:claim_node:{node_id}", timeout=5):
    # 1. Kiểm tra WIP Limit
    cad_count = count_employee_active_cad(employee_id)
    if is_cad_node and cad_count >= 3:
        raise HTTPException(status_code=400, detail="WIP_CAD_LIMIT_REACHED")
    
    # 2. Atomic Database Update
    cursor.execute("""
        UPDATE task_node_assignments
        SET assigned_employee_id = %s, started_at = %s, status = 'in_progress'
        WHERE task_node_id = %s AND role_code = %s AND assigned_employee_id IS NULL
        RETURNING id
    """, (employee_id, utcnow(), node_id, role_code))
    
    if not cursor.fetchone():
        raise HTTPException(status_code=409, detail="TASK_ALREADY_CLAIMED")
    
    # 3. Xóa cache và bắn SSE
    invalidate_cache("task_pool:*")
    publish_sse_event("TASK_CLAIMED", {"node_id": node_id, "employee_id": employee_id})
```

### 2. Thuật toán Kế Thừa Túi Hồ Sơ (Dossier Inheritance):
```python
def get_inherited_dossier_files(contract_id, current_node_code):
    # K03 (Vẽ Cad) lấy file từ K02 (ảnh mốc, tọa độ)
    # K06 (Pháp lý) lấy file bản vẽ từ K03
    # K08 (Bàn giao) lấy trọn bộ toàn bộ file đã duyệt của các bước trước
    ...
```

### 3. Thuật toán Hồi Tố & Quay Ngược Bước (Rollback & Cascade Reset):
```python
def rollback_workflow_to_target_node(contract_id: str, current_node_id: str, target_node_code: str, reason: str, reviewer_id: str):
    """
    Khi VPĐK hoặc cơ quan nhà nước trả hồ sơ tại K06:
    - Reset K_target (VD K03) về 'ready' với nhãn REWORK khẩn cấp.
    - Reset các node trung gian (K04, K05, K06) về 'pending'.
    - Tăng phiên bản version += 1 và lưu vết Audit Log.
    - Xóa cache Redis và bắn SSE WORKFLOW_ROLLBACK.
    """
    with db_transaction():
        # 1. Tìm danh sách các node nằm giữa target_node và current_node
        nodes_to_reset = get_nodes_in_range(contract_id, start_code=target_node_code, end_node_id=current_node_id)
        
        # 2. Reset target node về READY (Rework)
        target_node = nodes_to_reset[0]
        cursor.execute("""
            UPDATE task_nodes 
            SET status = 'ready', is_rework = TRUE, rework_reason = %s, version = version + 1
            WHERE id = %s
        """, (reason, target_node['id']))
        
        # 3. Reset các node phía sau về PENDING
        for intermediate_node in nodes_to_reset[1:]:
            cursor.execute("""
                UPDATE task_nodes 
                SET status = 'pending', is_accepted = FALSE, accepted_at = NULL, version = version + 1
                WHERE id = %s
            """, (intermediate_node['id'],))
            
        # 4. Ghi Audit Log
        insert_audit_log(contract_id, action="WORKFLOW_ROLLBACK", from_node=current_node_id, to_node=target_node['id'], reason=reason, user_id=reviewer_id)
        
        # 5. Xóa cache Redis & Bắn SSE
        invalidate_cache("task_pool:*")
        publish_sse_event("WORKFLOW_ROLLBACK", {"contract_id": contract_id, "target_node_id": target_node['id'], "reason": reason})
```

### 4. Thuật toán Nhường Việc / Cứu Viện Bất Khả Kháng (Yield Node to Pool):
```python
def yield_node_for_help(node_id: str, employee_id: str, reason: str):
    """
    Khi thợ gặp sự cố bất khả kháng (ốm đau, hư máy):
    - Đặt cờ is_help_requested = True và đẩy Node lên Bể việc với nhãn Cứu viện.
    - Trong lúc chưa ai nhận: node vẫn thuộc trách nhiệm của thợ cũ, vẫn tính vào tải (WIP < 3).
    - Khi có đồng đội nhận & hoàn thành: chuyển quyền sở hữu và giải phóng tải cho thợ cũ.
    """
    with db_transaction():
        cursor.execute("""
            UPDATE task_nodes
            SET is_help_requested = TRUE, yield_reason = %s, yielded_by_employee_id = %s
            WHERE id = %s AND assigned_employee_id = %s AND status = 'in_progress'
            RETURNING id
        """, (reason, employee_id, node_id, employee_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="CANNOT_YIELD_NODE")
            
        invalidate_cache("task_pool:*")
        publish_sse_event("NODE_YIELDED_FOR_HELP", {"node_id": node_id, "reason": reason})
```

---

# 📁 CHƯƠNG 7: HƯỚNG DẪN THI CÔNG TỪNG FILE

### 📁 FILE 1: `dev/backend/src/contracts/workflow_runtime.py`
- Triển khai `claim_and_start_task(node_id, employee_id, role_code)`.
- Triển khai `submit_task_node_for_acceptance(node_id, employee_id, payload)`.
- Triển khai `accept_task_node(node_id, reviewer_id, review_outcome)`.
- Triển khai logic đóng K08: kiểm tra `all_checklists_accepted` + `debt_is_settled_or_approved`.

### 📁 FILE 2: `dev/backend/src/employee_portal/service.py` & `router.py`
- Endpoint `GET /api/employee-portal/task-pool` (Redis Cached).
- Endpoint `POST /api/employee-portal/tasks/{node_id}/claim`.
- Endpoint `POST /api/employee-portal/tasks/{node_id}/submit`.
- Endpoint `GET /api/employee-portal/daily-summary`.

### 📁 FILE 3: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Dải tiến độ Compact Pill 1 dòng siêu gọn nhẹ.
- Node Inspector Tab tinh gọn: CustomSelect nền đặc 100%, Cài đặt SLA, Đầu ra nghiệm thu, Điều kiện kích hoạt, Nút đặt node bắt đầu.
- Hộp Chờ duyệt nghiệm thu cố định ở cuối panel.

### 📁 FILE 4: `dev/frontend/src/features/handover/HandoverPanel.jsx`
- 2 Card: **Giao hồ sơ cho khách** (tự tích xanh khi sếp duyệt 100% checklist) & **Thu đủ tiền hợp đồng** (tự tích xanh khi hết nợ hoặc duyệt nợ).
- Nút `[ 📝 Xin duyệt nợ ]` khi còn công nợ.

### 📁 FILE 5: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx` & `employeePortal.css`
- **Sửa lỗi Layout Grid**: Bọc toàn bộ vào `<div className="employee-workspace__main">`.
- Giao diện Bàn làm việc Cột chính: Bể việc sẵn sàng nhận (Task Pool), Việc tôi đang làm (Live Timer), Hộp Kế thừa hồ sơ, Ca đã nộp trong ngày, Lịch tuần FullCalendar full-width không bị cắt chữ.

---

# 🧪 CHƯƠNG 8: KỊCH BẢN KIỂM THỬ E2E

```bash
# 1. Chạy Backend Test Suite
pytest dev/backend/tests/ -v

# 2. Chạy Frontend Test Suite
npm --prefix dev/frontend test
```

### 6 Bước Kiểm Thử Chống Trùng & Vận Hành Bể Việc:
1. **Admin Setup SLA** ➔ K01 được cài hạn 1 ngày 0 giờ, K02 hạn 4 giờ. Kích hoạt quy trình ➔ K01 vào Bể việc.
2. **Săn việc Đua tốc độ** ➔ Thợ A và Thợ B cùng bấm nhận K01 ➔ Redis Lock xử lý tức thì, Thợ A nhận thành công, Thợ B nhận thông báo Toast nhẹ nhàng.
3. **Đồng bộ Sơ đồ Giám đốc** ➔ Canvas Giám đốc lập tức sáng Avatar Thợ A qua SSE mà không cần F5.
4. **Cuốn chiếu nhiều ca** ➔ Thợ A nộp K01 ➔ Nhận tiếp ca K02 của hợp đồng khác ngay.
5. **Kế thừa hồ sơ** ➔ Thợ Cad mở K03 thấy trọn bộ ảnh mốc tọa độ từ K02.
6. **Bàn giao K08 & Duyệt nợ** ➔ Duyệt checklist K08 ➔ Tích xanh giao hồ sơ; HĐ còn nợ 5tr ➔ Bấm Xin duyệt nợ ➔ Giám đốc duyệt ➔ Hoàn tất HĐ thành công!
