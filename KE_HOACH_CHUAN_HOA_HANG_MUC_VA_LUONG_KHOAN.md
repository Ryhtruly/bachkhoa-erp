# 📐 KẾ HOẠCH THI CÔNG: CHUẨN HOÁ HẠNG MỤC & LƯƠNG KHOÁN
## BÁCH KHOA ERP (WIFIM) · lập 18/08/2026

> **Cách dùng file này:** đây là sổ thi công. Mỗi bước có trạng thái, việc phải làm, cách kiểm,
> và một khối **Nhật ký** để ghi lại đã thêm/sửa gì sau khi làm xong. Trạng thái:
> ⬜ chưa làm · 🔄 đang làm · ✅ xong · ⏸️ tạm dừng chờ quyết định.
>
> Mọi con số đều đo trực tiếp trên DB/API đang chạy, không phỏng đoán.

---

## 📊 BẢNG TIẾN ĐỘ TỔNG

| Giai đoạn | Bước | Nội dung | Trạng thái |
| :---: | :---: | :--- | :---: |
| **1** | 1.1 | Thêm cột `code` cho `task_types` | ✅ |
| | 1.2 | Endpoint danh mục cây Gói → Hạng mục | ✅ |
| | 1.3 | Bỏ mảng dịch vụ ghi cứng ở `routes_dashboard.py` | ✅ |
| | 1.4 | Ô chọn 2 tầng Gói → Hạng mục khi soạn hợp đồng | ✅ |
| | 1.5 | Chuyển các nơi lọc theo tên → `task_type_id` | ✅ |
| **2** | 2.1 | 🔴 Vá `_custom_piece_rates` mất dữ liệu (làm sớm) | ✅ |
| | 2.2 | Viết lại API bảng giá đọc từ DB, xoá giá ghi cứng | ✅ |
| | 2.3 | Sửa giá = tạo bản mới, giám đốc duyệt | ✅ |
| | 2.4 | Gán `department_id` cho `work_items` | ✅ |
| | 2.5 | Kiểm chứng động cơ khoán không tính trùng | ✅ |
| | 2.6 | Cảnh báo khi node đo vẽ chưa gắn khoán (không chặn) | ✅ |
| | 2.7 | Màn Bảng giá: hiệu lực, người duyệt, lịch sử | ✅ |
| | 2.8 | 🆕 Xoá hệ ghi cứng thứ 3 `DEFAULT_NODE_RATES` (chốt lương) | ✅ |
| **3** | 3.1 | Cột `priority` cho `service_lines` | ✅ |
| | 3.2 | Bảng hệ số gợi ý `priority_multipliers` | ✅ |
| | 3.3 | Đặt ưu tiên: quyền giám đốc + bắt lý do | ✅ |
| | 3.4 | Nhãn + "thưởng dự kiến" lúc nhận việc | ✅ |
| | 3.5 | Màn phân bổ thưởng lúc hoàn thành | ✅ |
| | 3.6 | Sinh `PRIORITY_BONUS` vào lương | ✅ |
| | 3.7 | Sổ lương tách khoán / thưởng | ✅ |
| **4** | 4.1–4.5 | Quản lý khách hàng, tìm & tự điền, chống trùng | ✅ |
| **5** | 5.1–5.4 | Nhận dữ liệu Google Form + xác minh | ⏸️ |
| **6** | 6.1–6.5 | Nhắc nợ qua Zalo | ⏸️ |

⏸️ Giai đoạn 5–6 chờ anh Huy chốt: đường gửi Zalo (OA có phí / bán tự động) và cách nối Google Form.

---

## ✅ CÁC QUYẾT ĐỊNH ĐÃ CHỐT

Tất cả câu hỏi nghiệp vụ đã kín — không còn gì chặn việc code Giai đoạn 1–4.

| # | Vấn đề | Quyết định |
| :--- | :--- | :--- |
| Q1 | Một hạng mục bán = mấy khoản khoán | **Tự do hoàn toàn** — người thiết kế quy trình gắn công việc con tuỳ hồ sơ, không khoá cứng bộ nào |
| Q2 | "Tách thửa đo vẽ" vs "Tách thửa pháp lý" | **Một** — quy trình quyết (có bản vẽ thì bỏ node đo vẽ), không tách mã khoán |
| Q3 | Gói Xây dựng có mã khoán riêng | **Không** — dùng chung công việc con đo vẽ nếu cần khảo sát; không thì pháp lý ăn lương cứng |
| Q4 | Quy trình không khai công việc khoán | **Không tự sinh tiền.** Chặn ngay lúc kích hoạt nếu node đo vẽ chưa gắn khoán |
| Q5 | Ai đặt ưu tiên | **Chỉ giám đốc**, đặt **từ đầu**, khoá khi kích hoạt — không đổi giữa chừng |
| Q6 | Cách tính thưởng ưu tiên | **Hệ số gợi ý sẵn, giám đốc sửa số cuối**; chọn từng người từng khoản |
| Q7 | Nhân viên thấy thưởng lúc nào | **Thấy "dự kiến" khi nhận việc**, tiền vào lương khi hoàn thành hợp đồng |

### Quy tắc tính khoán (bản cuối)

> **Tiền khoán = tổng các công việc con có giá trong checklist của cả hồ sơ.**
> Không có công việc con nào thì không sinh tiền. Không có cơ chế "rơi về giá hạng mục".

| Hồ sơ Tách thửa | Bên đo vẽ nhận |
| :--- | ---: |
| K02 Đo GPS 1.200.000 · K03 Điều chỉnh bản vẽ 500.000 | **1.700.000** |
| Khách đã đưa sản phẩm kỹ thuật → không có node đo vẽ | **0** — không làm thì không nhận |

### Mô hình lương theo bộ phận

| Bộ phận | Cách trả |
| :--- | :--- |
| **Đo vẽ** | Khoán theo công việc con (13 mã `SURVEY_*`) |
| **Pháp lý** | Lương cứng (`employees.base_salary`) + khoán lượt đi nộp (`LEGAL_SUBMISSION_DELIVERY` 350.000/lượt) |
| **Xây dựng** | Dùng chung công việc con đo vẽ khi cần; `CONSTRUCTION_PERMIT` có thể không dùng tới |

### Danh mục = bán cho khách · Khoán = công việc con thực tế → **hai thứ tách rời, không map 1-1**

---

## 🧭 NGUYÊN TẮC XUYÊN SUỐT

1. **Một nguồn sự thật.** Danh mục ở `task_types`, giá khoán ở `work_item_rates`. Không ghi cứng trong code.
2. **Tiền có lịch sử, không ghi đè.** Sửa giá = tạo bản mới có `effective_from`, giữ bản cũ để đối chiếu.
3. **Nối bằng khoá, không bằng tên.** Dùng `task_type_id`, đừng so `service_type` dạng chữ (`"Tách Thửa"` ≠ `"Tách thửa"`).
4. **Xoá cache khi dữ liệu đổi.** Bài học vừa gặp: cache danh mục/giá không xoá thì UI thấy số cũ.
5. **Đo trên dữ liệu thật trước khi báo xong.** Không tin log im lặng, không tin giả định.

---

## 🔍 HIỆN TRẠNG ĐO ĐƯỢC (nền để thi công)

| Chỗ | Tình trạng | Ảnh hưởng |
| :--- | :--- | :--- |
| `task_types` | 22 hạng mục / 3 gói, **đủ** | GĐ1 chỉ cần lộ ra API, không thêm dữ liệu |
| `/api/config` services | **ghi cứng 9 mục** ở `routes_dashboard.py:83`, sai chính tả, mất gói Xây dựng | Bước 1.3 |
| `work_items` + `work_item_rates` | 15 mã, có lịch sử/duyệt — **đây là hệ tính tiền thật** | Giữ, mở rộng |
| `DEFAULT_RATES_BY_ID` + `_custom_piece_rates` | giá ghi cứng + **sửa xong mất khi restart** | Bước 2.1, 2.2 — xoá |
| `work_pay_entitlements` | tiền thật bám `checklist_result_id` + `work_item_rate_id` | Nguồn đúng, giữ |
| `customers` | đã có sẵn 7 trường định danh + cột nguồn dữ liệu | GĐ4 chủ yếu là API/UI |
| `employee_pay_adjustments` | đã nối vào lương, có `reason`/`approved_by`/`voided_by` | GĐ3 dùng cho thưởng |
| `priority` | **chưa có** ở bảng nào | GĐ3 thêm mới |

---

## 🗺️ CHI TIẾT TỪNG BƯỚC

### GIAI ĐOẠN 1 — Chuẩn hoá danh mục hạng mục

**Mục tiêu:** mọi nơi đọc cùng một danh mục 22 hạng mục / 3 gói, nối bằng khoá.

#### Bước 1.1 — Thêm cột `code` cho `task_types` ✅
- **Làm:** migration thêm `code` (VD `SV_PARCEL_SPLIT`), điền cho 22 dòng hiện có, đặt `unique`.
- **Vì sao:** để nối hạng mục ↔ nơi khác bằng mã ổn định, không phụ thuộc tên tiếng Việt.
- **Cách kiểm:** `select code from task_types` đủ 22 mã, không trùng, không null.
- **Nhật ký (18/08):**
  - Migration `add_code_to_task_types`: thêm cột `code`, điền 22 mã, tạo unique index `task_types_code_key`.
  - Quy ước mã: `SV_*` (9 hạng mục Đo Vẽ), `LG_*` (10 Pháp Lý), `CP_*` (3 Xây Dựng). VD `SV_SPLIT`, `LG_SPLIT`, `CP_NEW`.
  - Model: thêm `code = Column(String, unique=True, nullable=True)` vào `dev/backend/src/db/models/operations.py`.
  - Kiểm DB: 22 dòng / 22 mã / 22 duy nhất / 0 null. Backend import lại OK.

#### Bước 1.2 — Endpoint danh mục cây Gói → Hạng mục ✅
- **Làm:** `GET /api/catalog/service-packages` trả `[{gói, [hạng mục]}]` từ `service_packages` + `task_types`; cache Redis; xoá cache khi danh mục đổi.
- **Cách kiểm:** gọi API đếm đủ 3 gói / 22 hạng mục, gói Xây dựng có đủ 3.
- **Nhật ký (18/08):**
  - File mới `dev/backend/src/routes/routes_catalog.py` — `GET /api/catalog/service-packages` trả cây `{gói, [hạng mục{id,code,name}]}`.
  - Cache Redis khoá `bachkhoa:catalog:service_packages` (TTL 1h) + hàm `invalidate_catalog_cache()` cho CRUD tương lai.
  - Nối router vào `index.py` (import + include cạnh dashboard).
  - Kiểm API: 3 gói / 22 hạng mục; Đo Vẽ 9 · Pháp Lý 10 · Xây Dựng 3.

#### Bước 1.3 — Bỏ mảng dịch vụ ghi cứng ✅
- **Làm:** `routes_dashboard.py:83` đọc từ DB thay cho mảng 9 mục. Giữ khoá `services` không gãy màn cũ.
- **Cách kiểm:** `/api/config` trả đủ hạng mục thật; `grep` không còn mảng ghi cứng.
- **Nhật ký (18/08):**
  - `routes_dashboard.py` `get_config()` nay nhận `db`, đọc `services` từ `catalog_tree()` thay cho mảng 9 mục.
  - Giữ khoá `services` là danh sách phẳng để màn cũ không gãy (ô 2 tầng sẽ dùng ở Bước 1.4).
  - Kiểm: `/api/config` trả **22** dịch vụ (trước 9), có đủ 6 mục pháp lý + 3 gói xây dựng từng bị mất.
  - Còn `departments`/`personnel` vẫn ghi cứng — ngoài phạm vi bước này, ghi chú để dọn sau.

#### Bước 1.4 — Ô chọn 2 tầng khi soạn hợp đồng ✅
- **Làm:** `ContractComposer` đổi ô chọn phẳng → chọn Gói rồi chọn Hạng mục; lưu `task_type_id`.
- **Cách kiểm:** trên UI chọn được cả 3 hạng mục gói Xây dựng; hợp đồng lưu đúng `task_type_id`.
- **Nhật ký (18/08):**
  - Backend: `ContractGenerateSchema` thêm `task_type_id` (optional); `_create_initial_service_line` nối theo KHOÁ trước, lùi về so tên chỉ khi thiếu khoá.
  - Frontend `ContractComposer.jsx`: tự tải `/api/catalog/service-packages`; ô Gói → ô Hạng mục (khoá tới khi chọn gói); submit kèm `task_type_id`.
  - Layout: tách Sale/nguồn xuống hàng riêng để lưới 2 cột không vỡ.
  - **Kiểm ca nối nhầm:** tạo hợp đồng với `task_type_id=tt_013` (Tách thửa PHÁP LÝ) → service_line nối đúng `tt_013 LG_SPLIT`, không lạc sang `tt_006` đo vẽ. Dọn sạch hợp đồng test.
  - Kiểm UI: 3 gói; chọn Pháp Lý → 10 hạng mục (có Chuyển nhượng/Tặng cho/Thừa kế). `npx vitest` 49/49.

#### Bước 1.5 — Chuyển các nơi lọc theo tên → `task_type_id` ✅
- **Làm:** rà bộ lọc màn Hợp đồng, màn Hồ sơ Đo vẽ / Pháp lý; lọc theo `task_type_id`.
- **Cách kiểm:** lọc "Tách thửa" ra đúng hồ sơ dù tên có hoa/thường khác nhau.
- **Nhật ký (18/08):**
  - Backend `routes_contracts.py` `workspace-list`: thêm query `task_type_id`, lọc `ServiceLine.task_type_id == ...` (ưu tiên), lùi về so tên khi thiếu; đưa vào cache key.
  - Frontend `Contracts.jsx`: bộ lọc đổi key `service` → `task_type_id`; options dựng từ `/api/catalog/service-packages` với nhãn "Gói · Hạng mục".
  - Màn Hồ sơ Đo vẽ / Pháp lý: chỉ tìm tự do theo tên, **không có danh sách ghi cứng** — không cần đụng.
  - Kiểm dữ liệu thật: lọc `tt_001` → 002; `tt_013` → 001+003 (đúng khoá, không trùng tên); không lọc → cả 3.
  - Test: cập nhật mock `Contracts.document.test.jsx` (thêm route catalog); `npx vitest` 49/49.

---

### GIAI ĐOẠN 2 — Gộp hai hệ lương khoán làm một

**Mục tiêu:** số trên màn Bảng giá khoán chính là số trả cho nhân viên, và sửa giá không mất.

#### Bước 2.1 — 🔴 Vá `_custom_piece_rates` mất dữ liệu ✅ *(làm gộp với 2.2/2.3)*
- **Làm:** chuyển override giá từ biến bộ nhớ sang ghi DB (`work_item_rates`).
- **Cách kiểm:** sửa một giá → restart backend → giá vẫn còn (hôm nay sẽ mất).
- **Nhật ký (18/08):** làm gộp — viết lại toàn bộ `routes_piece_rates.py`, bỏ hẳn `DEFAULT_RATES_BY_ID` + `_custom_piece_rates` (không còn biến bộ nhớ nào → không thể mất khi restart).

#### Bước 2.2 — Viết lại API bảng giá, xoá giá ghi cứng ✅
- **Làm:** `GET /api/piece-rates/rates` đọc từ `work_items` + `work_item_rates`; xoá `DEFAULT_RATES_BY_ID`.
- **Cách kiểm:** API trả đúng 15 mã với giá từ DB; đối chiếu số khớp `work_item_rates`.
- **Nhật ký (18/08):**
  - Backend viết lại: GET trả 15 `work_items` với giá `published` (đang hiệu lực) + `pending` (chờ duyệt) theo vai trò MAIN/ASSISTANT/SUBMITTER.
  - Kiểm API: 15 mã, số khớp bảng anh Huy đưa (Tách thửa 900k/200k, nộp hồ sơ 350k SUBMITTER, XD 1.500k).
  - Frontend `BangGiaKhoanScreen.jsx` viết lại theo work_item; kiểm trên trình duyệt: 15 dòng, số thật hiện đúng.

#### Bước 2.3 — Sửa giá = tạo bản mới, giám đốc duyệt ✅
- **Làm:** sửa giá ghi dòng `work_item_rates` mới `status='draft'` + `effective_from`; duyệt mới `published`.
- **Cách kiểm:** sửa giá → có dòng draft; duyệt → published; giá cũ vẫn còn để đối chiếu.
- **Nhật ký (18/08):**
  - `POST /rates` tạo `draft` (quyền `payroll.update`); `POST /rates/{id}/publish` (quyền `payroll.approve`) đóng kỳ giá cũ (`effective_to = ngày_mới - 1`) rồi cho giá mới hiệu lực; `DELETE` bỏ nháp; `GET /rates/history/{id}` xem lịch sử.
  - Ràng buộc DB: `no_published_overlap` (EXCLUDE), status chỉ draft/published/archived, published bắt buộc có người duyệt — đều thoả.
  - **Kiểm vòng đầy đủ:** đề xuất Tách thửa 950k → draft; duyệt → hiệu lực 950k; lịch sử: 900k (05→17/08) + 950k (18/08→nay), không chồng kỳ. **Đã hoàn nguyên về 900k thật** sau khi kiểm.
  - `effective_from` NOT NULL → nháp mặc định `current_date`.

#### Bước 2.4 — Gán `department_id` cho `work_items` ✅
- **Làm:** gán 13 mã `SURVEY_*` → Phòng Đo vẽ, `LEGAL_*` → Phòng Pháp lý, `CONSTRUCTION_*` → phòng phù hợp.
- **Cách kiểm:** không còn `work_items.department_id IS NULL`.
- **Nhật ký (18/08):** migration `assign_department_to_work_items` — `SURVEY_*` → Phòng Đo vẽ (13), `LEGAL_SUBMISSION_DELIVERY` + `CONSTRUCTION_PERMIT` → Phòng Pháp lý (2). Kiểm: 0 mã chưa gán; màn Bảng giá hiện đúng phòng. Xoá cache `bachkhoa:catalog:piece_rates`.

#### Bước 2.5 — Kiểm chứng động cơ khoán không tính trùng ✅
- **Làm:** đọc lại động cơ trong `workflow_runtime.py`; xác nhận tiền chỉ sinh từ checklist, **không** cộng thêm "giá hạng mục" (`service_lines.price` là giá bán, không phải khoán). Nếu có double-count thì sửa.
- **Cách kiểm:** tạo hồ sơ có nhiều công việc con → tổng khoán = đúng tổng công việc con, không dư.
- **Nhật ký (18/08):**
  - Đọc `_generate_work_pay_entitlements` (`workflow_runtime.py:2411`): tiền **chỉ** sinh từ checklist `is_payable` đã nghiệm thu × `work_item_rates`. Không có "giá hạng mục".
  - `grep` toàn backend: `service_lines.price` **không bao giờ** vào bảng lương/entitlement — đó là giá bán, không phải khoán. → **Không có double-count** như lo ngại ban đầu.
  - **NHƯNG phát hiện hệ ghi cứng thứ 3** → tách thành Bước 2.8 (cần anh Huy quyết).

#### Bước 2.6 — Cảnh báo khi node đo vẽ chưa gắn khoán ✅ *(anh Huy chọn 'cảnh báo, không chặn' 18/08)*
- **Làm:** thêm kiểm tra: node do Phòng Đo vẽ phụ trách mà checklist chưa gắn hạng mục khoán → chặn, cùng họ với "Thiếu đường nối".
- **Cách kiểm:** dựng node đo vẽ trống khoán → kích hoạt hiện cảnh báo (giám đốc vẫn bấm qua được).
- **Nhật ký (18/08):**
  - `ContractWorkflowDesigner.jsx`: khi kích hoạt, quét node có người `Phòng Đo vẽ` mà checklist không có mục `is_payable + work_item_id` → thêm dòng cảnh báo (song song "chưa phân công"), **không chặn**.
  - Dùng `department_name` sẵn trên assignment + `assignment_options`. Build 200, 49/49 test.

#### Bước 2.7 — Màn Bảng giá: hiệu lực, người duyệt, lịch sử ✅ *(làm cùng 2.2/2.3)*
- **Làm:** hiện `effective_from`, ai duyệt, nút xem lịch sử giá.
- **Cách kiểm:** mở màn thấy đủ; bấm lịch sử ra các bản giá cũ.
- **Nhật ký (18/08):** màn có cột "chờ duyệt" (số cam), nút Sửa (tạo đề xuất), nút Lịch sử (modal: vai trò/đơn giá/kỳ hiệu lực/trạng thái/người duyệt), nút Duyệt (chỉ giám đốc). Rủi ro "khoán đã khoá" của GĐ2 bỏ qua — anh Huy xác nhận 001–003 là data test.

#### Bước 2.8 — 🆕 Xoá hệ ghi cứng thứ 3: `DEFAULT_NODE_RATES` khi chốt lương ✅ *(anh Huy duyệt 18/08)*
- **Phát hiện (từ Bước 2.5):** `routes_payroll.py` có `DEFAULT_NODE_RATES` ghi cứng 9 mức theo **mã node K01–K09** (mã cố định cũ). Dùng ở 2 chỗ:
  1. **Chốt lương** (`close_employee_period`, dòng ~397): node đã nghiệm thu mà **chưa có** entitlement từ checklist → **tự tạo entitlement bằng giá ghi cứng**.
  2. **Sổ lương** (dòng ~242): node chưa có entitlement → **hiển thị giá ghi cứng** thay cho 0.
- **Vì sao sai:**
  - Trái quy tắc Q4 đã chốt: *"không có công việc con thì không sinh tiền"* — đây lại tự đẻ tiền.
  - Bám mã `K01–K09` là mã cố định cũ; **quy trình tự do mới không có mã này** → mọi node rơi về mức mặc định 350k/150k, sai bét.
  - Là nguồn tiền **thứ ba** song song với `work_item_rates`, đúng thứ GĐ2 đang dẹp.
- **Đề xuất sửa:** chốt lương chỉ **duyệt** entitlement đã sinh từ checklist (bỏ nhánh tự tạo bằng giá ghi cứng); sổ lương hiện đúng số entitlement (0 nếu node không có khoán). Xoá `DEFAULT_NODE_RATES`.
- **Vì sao chờ duyệt:** đây là **đổi số tiền lương** thực trả — cần anh Huy gật đầu trước khi động vào, dù nó chỉ đang thực thi đúng quy tắc đã chốt.
- **Nhật ký (18/08):**
  - `routes_payroll.py`: bỏ hằng `DEFAULT_NODE_RATES`; `close_employee_period` chỉ **duyệt** entitlement đã có, node không có khoán checklist thì **bỏ qua** (`approved_count` + `skipped_no_piece_rate`); sổ lương hiện `entitlement_amount` hoặc 0. Bỏ import thừa `json`, `uuid`.
  - **Kiểm data thật:** DB có 0 dòng "tự đẻ". Chốt lương Nguyễn Văn A (5 node xong, 1 khoán thật) → `approved=1, skipped=4`, DB vẫn 0 tự đẻ, tổng 1.200.000₫. Code cũ sẽ đẻ ~1,5–2 triệu tiền ảo.

**Rủi ro GĐ2:** hợp đồng đang chạy đã **khoá** khoán dự kiến theo giá cũ — đổi cấu trúc không được
làm lệch. Trước khi áp dụng: đối chiếu tổng khoán dự kiến trước/sau trên dữ liệu thật, khớp từng đồng.

---

### GIAI ĐOẠN 3 — Ưu tiên hồ sơ & thưởng thêm

**Mục tiêu:** hồ sơ gấp → nhân viên làm xong được trả cao hơn, giám đốc quyết, có dấu vết.

Thưởng đi qua `employee_pay_adjustments` (`adjustment_type='PRIORITY_BONUS'`) — **không cần bảng mới**.

#### Bước 3.1 — Cột `priority` cho `service_lines` ⬜
- **Làm:** `priority` (`NORMAL`/`HIGH`/`URGENT`, mặc định `NORMAL`) + `priority_reason` + `priority_set_by` + `priority_set_at`.
- **Nhật ký:** *(điền sau)*

#### Bước 3.2 — Bảng hệ số gợi ý `priority_multipliers` ⬜
- **Làm:** mỗi mức một hệ số (HIGH ×1,2 · URGENT ×1,5), có hiệu lực theo ngày + người duyệt. Chỉ **gợi ý**, không tự sinh tiền.
- **Nhật ký:** *(điền sau)*

#### Bước 3.3 — Đặt ưu tiên: quyền giám đốc + bắt lý do ⬜
- **Làm:** ô chọn ưu tiên ở màn lập hợp đồng; kiểm quyền; bắt nhập lý do; **khoá chỉ đọc sau khi kích hoạt**.
- **Nhật ký:** *(điền sau)*

#### Bước 3.4 — Nhãn + "thưởng dự kiến" lúc nhận việc ⬜
- **Làm:** nhãn ưu tiên trên thẻ/node; dòng *"ưu tiên cao — thưởng **dự kiến** ~X khi hoàn thành"*. Chữ "dự kiến" bắt buộc.
- **Nhật ký:** *(điền sau)*

#### Bước 3.5 — Màn phân bổ thưởng lúc hoàn thành ⬜
- **Làm:** khi hợp đồng xong, mở màn: tính sẵn tổng theo hệ số, liệt kê người tham gia + khoán từng người, giám đốc gõ số cho từng người. Số chốt < dự kiến thì **bắt ghi lý do**.
- **Nhật ký:** *(điền sau)*

#### Bước 3.6 — Sinh `PRIORITY_BONUS` vào lương ⬜
- **Làm:** xác nhận → tạo dòng `employee_pay_adjustments` (`source_reference` trỏ hợp đồng), tự chảy vào lương tháng.
- **Nhật ký:** *(điền sau)*

#### Bước 3.7 — Sổ lương tách khoán / thưởng ⬜
- **Làm:** sổ lương hiện *khoán theo công việc* và *thưởng ưu tiên* thành hai dòng riêng.
- **Nhật ký:** *(điền sau)*

---

### GIAI ĐOẠN 4 — Quản lý khách hàng & tự điền khi trùng

**Mục tiêu:** gõ tên/SĐT/CCCD/MST ra khách cũ, tự điền, không tạo trùng. Cột đã có sẵn, **không migration**.

#### 🔑 HAI LOẠI KHÁCH — anh Huy nhấn 18/08 *(áp dụng xuyên suốt GĐ4)*

DB đã có `customer_type` (mặc định `individual`) + đủ cột. Hiện trạng: composer **chưa thu thập trường định danh nào**, ghép khách theo `full_name` (dễ trùng). GĐ4 phải phân biệt:

| | Cá nhân (`individual`) | Doanh nghiệp (`business`) |
| :--- | :--- | :--- |
| Định danh chính | **CCCD** (`id_card_number` + ngày + nơi cấp) | **Mã số thuế** (`tax_id`) |
| Người ký | chính khách | **người đại diện** (`representative_name` + `representative_role`) |
| Tên trên hợp đồng | họ tên | tên công ty + đại diện |
| Chống trùng | theo CCCD | theo MST |

Ràng buộc: form chọn loại khách trước → hiện đúng bộ trường; loại nào bắt buộc định danh của loại đó; tài liệu DOCX điền đúng khối (CCCD vs MST+đại diện).

| Bước | Làm | Trạng thái |
| :--- | :--- | :---: |
| 4.1 | Composer + API tạo hợp đồng: `customer_type` + đúng bộ trường theo loại | ✅ |
| 4.2 | Endpoint tìm khách theo tên/SĐT/**CCCD**/**MST**, kèm số hợp đồng đã có | ✅ backend |
| 4.3 | Soạn hợp đồng: chọn khách cũ tự điền đúng loại; sửa thì hỏi có cập nhật hồ sơ khách không | ⬜ |
| 4.4 | Chống trùng theo khoá: trùng **MST**/**CCCD** → ghép khách cũ (không tạo trùng) | ✅ backend |
| 4.5 | Ghép khách theo **khoá định danh** (CCCD/MST), bỏ ghép theo `full_name` | ✅ backend |

---

### GIAI ĐOẠN 5 — Google Form ⏸️  ·  GIAI ĐOẠN 6 — Nhắc nợ Zalo ⏸️

Giữ nguyên định hướng, chờ hai quyết định:
- **GĐ5:** cách nối Google Form (webhook có khoá bí mật). Khách tự khai vào `customers` với
  `source_channel='GOOGLE_FORM'`, `data_quality_status='UNVERIFIED'`, phải xác minh mới dùng in hợp đồng.
- **GĐ6:** đường gửi Zalo — **OA chính thức (có phí)** hay **bán tự động** (soạn sẵn, người bấm gửi).
  Nút nhắc nợ đặt ở màn Thu Công Nợ; mỗi lần ghi `zalo_interactions`; chặn nhắc quá dày.

---

## ⚠️ RỦI RO CHUNG

| Rủi ro | Cách phòng |
| :--- | :--- |
| Đổi bảng giá làm lệch khoán **đã khoá** của hợp đồng đang chạy | Đối chiếu tổng trước/sau trên dữ liệu thật, khớp từng đồng |
| Hạng mục cũ không có trong danh mục chuẩn | Ẩn (`is_active=false`), không xoá |
| Sửa giá không ai duyệt | Bắt qua `draft` → giám đốc duyệt mới `published` |
| Nhân viên tưởng "thưởng dự kiến" là chắc chắn | Chữ "dự kiến" cạnh số; số chốt thấp hơn thì bắt ghi lý do |
| Cache danh mục/giá không xoá → UI thấy số cũ | Xoá cache ngay trong mọi route đổi danh mục/giá |

---

## 📌 THỨ TỰ THI CÔNG

```
GĐ1 (danh mục)  →  GĐ2 (gộp giá khoán)  →  GĐ3 (ưu tiên → thưởng)
     └──────────→  GĐ4 (khách hàng)  →  GĐ5 (Form) ⏸️  →  GĐ6 (Zalo) ⏸️
```

GĐ1 trước vì GĐ2–3 bám vào danh mục chuẩn. Nhánh khách hàng (4) chạy song song được.
**Bước 2.1** (vá mất dữ liệu) có thể nhảy lên làm ngay, không phụ thuộc GĐ1.

---

## 📒 NHẬT KÝ THAY ĐỔI (cập nhật khi làm)

> Mỗi lần làm xong một bước, ghi vào đây: ngày, bước, file đã thêm/sửa, cách đã kiểm.

**18/08/2026 · Bước 1.1** — Thêm mã ổn định cho `task_types`.
- DB: migration `add_code_to_task_types` (cột `code` + unique index), điền 22 mã theo gói.
- Code: `dev/backend/src/db/models/operations.py` — `TaskType.code`.
- Kiểm: 22/22 mã, không trùng/null.

**18/08/2026 · Bước 1.2** — Endpoint danh mục cây.
- Thêm `dev/backend/src/routes/routes_catalog.py` (`GET /api/catalog/service-packages`, cache + invalidate).
- Nối router trong `dev/backend/src/index.py`.
- Kiểm: 3 gói / 22 hạng mục.

**18/08/2026 · Bước 1.3** — Bỏ dịch vụ ghi cứng.
- `dev/backend/src/routes/routes_dashboard.py` `get_config()` đọc `services` từ DB.
- Kiểm: `/api/config` từ 9 → 22 dịch vụ.

**18/08/2026 · Bước 1.4** — Ô chọn 2 tầng Gói → Hạng mục.
- Backend: `dev/backend/src/contracts/schemas.py` (+`task_type_id`), `dev/backend/src/contracts/services.py` (nối theo khoá).
- Frontend: `dev/frontend/src/features/contracts/ContractComposer.jsx` (2 tầng + tự tải danh mục).
- Kiểm: nối đúng khoá cho "Tách thửa" pháp lý; 49/49 test.

**18/08/2026 · Bước 1.5** — Lọc hợp đồng theo khoá.
- Backend: `dev/backend/src/routes/routes_contracts.py` `workspace-list` (+query `task_type_id`).
- Frontend: `dev/frontend/src/pages/Contracts.jsx` (bộ lọc theo `task_type_id`, options từ catalog).
- Test: `dev/frontend/src/pages/Contracts.document.test.jsx` (mock catalog). 49/49.

**✅ GIAI ĐOẠN 1 HOÀN TẤT (18/08/2026)** — danh mục 22 hạng mục / 3 gói là một nguồn sự thật; mọi nơi nối bằng `task_type_id`, không còn mảng ghi cứng.

**18/08/2026 · Bước 2.1–2.3 + 2.7** — Gộp hai hệ giá khoán. Viết lại `dev/backend/src/routes/routes_piece_rates.py` (đọc/ghi `work_item_rates`, bỏ `DEFAULT_RATES_BY_ID` + dict bộ nhớ, draft→duyệt→lịch sử) và `dev/frontend/src/components/finance/screens/BangGiaKhoanScreen.jsx`. Kiểm API 15 mã số thật; vòng draft→publish→history không chồng kỳ; UI đúng. 49/49.

**18/08/2026 · Bước 2.4** — migration `assign_department_to_work_items`: 13 `SURVEY_*`→Đo vẽ, 2→Pháp lý.

**18/08/2026 · Bước 2.5** — Xác minh động cơ: tiền chỉ từ checklist × `work_item_rates`; `service_lines.price` không vào lương → không double-count. Phát hiện hệ ghi cứng thứ 3.

**18/08/2026 · Bước 2.8** — Xoá `DEFAULT_NODE_RATES` (nguồn tiền thứ 3, tự đẻ theo mã K01–K09). `dev/backend/src/routes/routes_payroll.py`: chốt lương chỉ duyệt khoán checklist. Kiểm data thật: approved=1, skipped=4, 0 dòng tự đẻ.

**18/08/2026 · Bước 2.6** — Cảnh báo (không chặn) node đo vẽ chưa gắn khoán. `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`.

**✅ GIAI ĐOẠN 2 HOÀN TẤT (18/08/2026)** — một nguồn giá khoán duy nhất (`work_item_rates`); màn Bảng giá = số thật; sửa giá qua draft→duyệt có lịch sử; xoá cả 3 hệ ghi cứng cũ (`DEFAULT_RATES_BY_ID`, `_custom_piece_rates`, `DEFAULT_NODE_RATES`); chốt lương không còn tự đẻ tiền.

**18/08/2026 · GĐ3 (backend + money) — 3.1/3.2/3.3/3.5/3.6/3.7 xong, kiểm data thật:**
- DB: migration `add_priority_to_service_lines` (priority NORMAL/HIGH/URGENT + reason + set_by/at), bảng `priority_multipliers` (HIGH×1.2, URGENT×1.5). Model `ServiceLine` +4 cột.
- Đặt ưu tiên: `POST /api/contracts/service-lines/{id}/priority` (giám đốc, khoá sau kích hoạt, bắt lý do); và tại lúc tạo hợp đồng qua `/generate` (`priority`+`priority_reason`, chỉ giám đốc HIGH/URGENT). Composer có ô chọn (chỉ giám đốc). Kiểm: NORMAL mặc định, 422 thiếu lý do, 409 khoá sau kích hoạt.
- Thưởng: `GET /{cid}/priority-bonus/preview` (mức + hệ số + khoán từng người + gợi ý = khoán×(hệ số−1)), `POST /{cid}/priority-bonus` (giám đốc chốt số cuối → `employee_pay_adjustments` type BONUS, đánh dấu `PRIORITY_BONUS`, idempotent). Kiểm 001: URGENT×1.5, khoán 1.2tr→gợi ý 600k→giám đốc sửa 500k→lương ròng 1.2tr+0.5tr=**1.7tr**; phát lại bị chặn.
- **Sửa bug sẵn có:** sổ lương khớp type chữ thường ('bonus'/'penalty') trong khi DB dùng HOA (BONUS/DEDUCTION/ALLOWANCE/REIMBURSEMENT) → mọi khoản điều chỉnh hiện danh sách mà **không cộng vào lương**. Đã sửa `routes_payroll.py`.
- **Còn lại (UI):** 3.4 nhãn "thưởng dự kiến" lúc nhận việc; 3.5 màn phân bổ thưởng cho giám đốc bấm (backend đã xong).

**18/08/2026 · GĐ4 (backend) — 2 loại khách:** DB đã đủ cột. `ContractGenerateSchema` +trường định danh; `_tim_hoac_tao_khach` ghép theo khoá (id→MST→CCCD→SĐT), tạo mới đủ trường theo loại, khách cũ chỉ điền chỗ trống. `GET /api/contracts/customers/search` (tên/SĐT/CCCD/MST + số HĐ). Kiểm data thật: doanh nghiệp lưu MST+đại diện, cá nhân lưu CCCD (không lẫn); dedup cùng MST → 1 khách/2 HĐ. **Còn UI composer 2 loại + tự điền.**

**18/08/2026 · GĐ3 + GĐ4 (UI) — HOÀN TẤT:**
- GĐ3 UI: composer có ô ưu tiên (chỉ giám đốc, bắt lý do); `PriorityBonusModal` + nút "Thưởng ưu tiên" trong header workspace (gợi ý số → giám đốc sửa → chốt vào lương); thẻ việc nhân viên hiện nhãn "★ Ưu tiên/⚡ Gấp · thưởng dự kiến".
- GĐ4 UI: composer có nút gạt **Cá nhân / Doanh nghiệp** đổi bộ trường (CCCD ↔ MST+đại diện), label "Tên công ty", tìm khách cũ gõ ≥2 ký tự → dropdown tự điền. Kiểm trình duyệt: gạt loại đổi field đúng; tìm "Lê Quang" ra khách cũ.

**✅ GIAI ĐOẠN 3 HOÀN TẤT** — ưu tiên đặt từ đầu (giám đốc, khoá sau kích hoạt); thưởng gợi ý theo hệ số, giám đốc chốt số, vào lương tách riêng; nhân viên thấy "dự kiến".
**✅ GIAI ĐOẠN 4 HOÀN TẤT** — 2 loại khách (cá nhân CCCD / doanh nghiệp MST+đại diện), ghép theo khoá không trùng, tìm-tự-điền. (Còn GĐ5 Google Form ⏸️, GĐ6 Zalo ⏸️ — chờ anh Huy chốt.)

**18/08/2026 · Tab Khách Hàng (mới, ngoài kế hoạch gốc — anh Huy yêu cầu):** không có màn quản lý khách nên bổ sung.
- Backend `routes_customers.py`: `GET /api/customers` (list + lọc loại + số HĐ), `GET /{id}` (chi tiết + hợp đồng), `PUT /{id}` (sửa, chống trùng MST/CCCD), `GET /search`. Quyền `customer`. Nối router + thêm `customer` vào permissions `/api/auth/me`.
- Frontend `CustomerDirectory.jsx` + CSS: master-detail, tìm/lọc cá nhân/doanh nghiệp, xem định danh + danh sách hợp đồng, giám đốc sửa (2 loại). Tab "Khách Hàng" trong sidebar (sau CRM).
- Kiểm trình duyệt: tab hiện, 3 khách, chi tiết + hợp đồng đúng, sửa CCCD lưu được. 49/49 test.

**18/08/2026 · Tra cứu MST tự điền (anh Huy yêu cầu):** nhập mã số thuế → tự sinh các trường khác.
- Backend `routes_customers.py`: `GET /api/customers/lookup-tax/{mst}` proxy sang VietQR (nguồn Cục Thuế), timeout 6s, nuốt lỗi êm (found=false, không ném 5xx).
- Frontend: nút **"Tra cứu"** cạnh ô MST ở composer (tab Doanh nghiệp) và form sửa khách → điền tên công ty + địa chỉ; gõ tay vẫn được nếu API sập.
- Chỉ dùng cho **doanh nghiệp** (cá nhân/CCCD không có API công khai).
- Kiểm thật: MST FPT 0101248141 → "CÔNG TY CỔ PHẦN FPT" + "Số 10 phố Phạm Văn Bạch..."; MST bậy → found=false không lỗi. 49/49 test.