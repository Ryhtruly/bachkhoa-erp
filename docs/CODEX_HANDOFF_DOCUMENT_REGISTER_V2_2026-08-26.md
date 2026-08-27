# Bàn giao: Sổ tài liệu theo Hạng mục (V2) — 26/08/2026

Tài liệu cho Codex tiếp quản. Mọi số liệu dưới đây **lấy từ code và DB thật**, không viết theo trí nhớ.
Chỗ nào chưa kiểm chứng đều ghi rõ **CHƯA KIỂM CHỨNG**.

Liên quan:
- `docs/CHUC_NANG_CON_THIEU_THEM_HANG_MUC.md`
- `docs/CLEANUP_SAU_EXPAND.md`

---

## 1. Trạng thái tổng quan

### Đã hoàn thành
- Backend: bảng phạm vi áp dụng, gộp theo độ ưu tiên, materialize theo Hạng mục, cổng 503, phiếu miễn neo Hạng mục, promotion có phạm vi, so cấu hình mẫu, guard `kind` cho INPUT/OUTPUT, `needs_more`
- 4 route WAIVE
- Frontend màn 1 (form Hạng mục, ba chế độ) và phần lớn màn 2 (ba nhóm nguồn, chip trạng thái, modal xin miễn)
- Migration EXPAND đã viết + diễn tập local đạt

### Cập nhật 26/08 chiều — màn 2 và màn 3 đã xong

**Màn 2 hoàn tất:**
- Nút **"Đề xuất loại tài liệu"** đã nối vào `DocumentRegister` (chỉ hiện khi V2 +
  có `checklistResultId`; V1 giữ nút "Thêm loại giấy tờ phát sinh" cũ)
- `EmployeeItemWorkspace` truyền `checklistResultId={checklist[0]?.id}`
- `SlotRequestModal` hỗ trợ INPUT 0 tệp và `needs_more` (PATCH cùng request_id)

**Màn 3 hoàn tất:** `ApprovalQueue.jsx` có ba quyết định (duyệt / từ chối /
**yêu cầu bổ sung**), nhóm **Xin miễn giấy** riêng, chọn phạm vi promotion mặc
định **"Chỉ Hạng mục này"**, bỏ sạch `window.prompt`.

### HAI LỖI 500 ĐÃ SỬA — đọc kỹ trước khi viết truy vấn mới

1. `slot_requests._LIST_QUERY` đọc `r.kind` trên `document_slot_creation_requests`
   — cột **chỉ có sau EXPAND**. Trên live nó làm `/api/slot-requests` trả 500.
   → Đổi thành `_list_query(db)` chọn biến thể theo schema; thiếu cột thì trả
   `'OUTPUT'` (loại duy nhất tồn tại trước khi có luồng INPUT).
2. `routes_document_register` đọc `sl.name` — **`service_lines` không có cột
   `name`**. Tên Hạng mục phải lấy `coalesce(tt.name, sl.service_type)`.

Hậu quả khi chưa sửa: trang **Hàng chờ duyệt hiện thẳng "Internal Server Error"**,
hỏng luôn phần legacy không liên quan. Đã có test chặn tái diễn trong
`test_schema_gate_v2.py::HangChoDuyetChiuDuocSchemaCuTests`.

### Chưa làm
- ~~Ảnh V2 trên dữ liệu thật~~ — XONG 26/08 (`v2-form-3che-do`, `v2-thu-cong`, `v2-man-hep`)
- ~~Kiểm chứng SSE hai tài khoản~~ — XONG 26/08, xem mục SSE
- Chức năng thêm Hạng mục vào hợp đồng đang tồn tại — **không tồn tại trong hệ thống**, xem doc riêng

### Blocker hiện tại
**EXPAND đã apply live 26/08.** Smoke test 9/9 đạt, dữ liệu không đổi một dòng
(4 hợp đồng · 4 Hạng mục · 33 ô giấy · 8 tệp · 6 link), 4 Hạng mục cũ **giữ nguyên
V1**, backfill 31 phạm vi = 16 GLOBAL + 15 TASK_TYPE.

Còn lại:
- **CONTRACT chưa chạy** — chờ EXPAND ổn định vài ngày rồi xin duyệt riêng

### Migration

| File | Trạng thái |
|---|---|
| `supabase/migrations/20260825124500_document_slot_waiver.sql` | **ĐÃ APPLY LIVE** (thêm `kind`, `revoked_at`, `revoked_by`) |
| `supabase/migrations/20260826040000_template_applicabilities_and_register_v2.sql` | ✅ **ĐÃ APPLY LIVE 26/08** — smoke test 9/9 đạt |
| `supabase/pending/CHUA_DUYET_waive_service_line_not_null.sql` | CONTRACT — **CHƯA CHẠY** |
| `supabase/pending/CHUA_DUYET_register_version_default_2.sql` | CONTRACT — **CHƯA CHẠY** |
| `supabase/pending/CHUA_DUYET_checklist_results_contract_id_contract.sql` | **M0b / SET NOT NULL — CHƯA CHẠY** (từ phiên trước) |

> **M0b / `SET NOT NULL` CHƯA CHẠY.** Không đưa lại vào `supabase/migrations/` khi chưa có duyệt riêng.

### Đối soát live SAU khi apply EXPAND (26/08/2026)
```
TRƯỚC : hợp đồng 4 · hạng mục 4 · ô giấy 33 · tệp 8 · link 6 · mẫu 31 · phiếu 1
SAU   : hợp đồng 4 · hạng mục 4 · ô giấy 33 · tệp 8 · link 6 · mẫu 31 · phiếu 1
        → KHÔNG đổi một dòng dữ liệu nào

hạng mục V1 = 4 · V2 = 0        (Hạng mục cũ giữ nguyên cách đọc)
phạm vi     = 31 = 16 GLOBAL + 15 TASK_TYPE   (khớp đúng 31 mẫu)
rác smoke   = 0                 (mọi phép thử đều rollback)
```

### Smoke test live — 9/9 ĐẠT
```
1. require_v2_schema không còn 503                        ĐẠT
2. hạng mục cũ = version 1                                ĐẠT
3. k01_blockers chạy được (can_submit=True)               ĐẠT
4. gợi ý 16 loại mẫu, mỗi mẫu chỉ một dòng                ĐẠT
5. Hạng mục MỚI = version 2                               ĐẠT
6. materialize đúng 3/3 ô đã chọn                         ĐẠT
7. Hạng mục V2 không trộn ô cấp Hợp đồng                  ĐẠT
8. chế độ NONE vẫn là V2                                  ĐẠT
9. chế độ NONE tạo 0 ô                                    ĐẠT
```
Project Supabase: `ejklrwydjplwzztfuygj`.

---

## 2. Luật nghiệp vụ đã chốt

### V1 vs V2
- **V1 (legacy)**: sổ giấy đọc từ ô cấp HỢP ĐỒNG (`scope='CONTRACT'`), dùng chung mọi Hạng mục. Chỉ xem, **không** bày thao tác ghi V2.
- **V2**: mỗi Hạng mục có bộ ô riêng, đóng băng lúc tạo. `service_lines.document_register_version` phân biệt. **Không** suy từ `created_at` hay "có slot chưa" — Hạng mục chọn 0 giấy vẫn là V2 hợp lệ.

### Ba chế độ chọn giấy (`document_selection_mode`)
| Mode | Payload | Ý nghĩa |
|---|---|---|
| `DEFAULT` | không kèm danh sách | server lấy applicability `is_default = true` |
| `CUSTOM` | `document_template_ids` ≥ 1 mã | đúng những mẫu đã chọn |
| `NONE` | danh sách rỗng/vắng | cố ý không thu giấy nào |

Thiếu mode → **422**. Mode lạ → 422. Mâu thuẫn (DEFAULT kèm list, NONE kèm list, CUSTOM rỗng) → 422.
Sentinel `TU_DONG_THEO_MAC_DINH` là **chi tiết nội bộ server**, chỉ sinh từ `phan_giai_lua_chon_giay("DEFAULT", …)`.

### Ba nguồn (`slot.source`, enum giữ nguyên)
`KHACH_HANG` · `CONG_TY` · `CO_QUAN` — đọc từ slot, **không** suy từ tên file.

### Cô lập theo Hạng mục
Mọi chip, đề xuất, phiếu miễn lấy theo `service_line_id`. Miễn ô của Hạng mục A **không** ảnh hưởng Hạng mục B, kể cả cùng hợp đồng, cùng loại giấy, kể cả ô legacy cấp Hợp đồng dùng chung.

### K01 và min_count
`k01_blockers` chặn khi ô `is_required` + `source='KHACH_HANG'` + chưa có tệp, **trừ** ô đã được miễn.
`min_count` đếm qua `checklist_result_document_links` → `dossier_document_links (link_status='DANG_DUNG')` → slot thật. Đề xuất chưa duyệt không có slot nên **về cấu trúc là không thể** lọt vào.

### Đề xuất loại tài liệu
`draft` → `pending` → (`approved` | `rejected` | `needs_more`); `needs_more`/`rejected` → sửa → `pending` lại (**cùng request_id**).
- `OUTPUT`: bắt buộc ≥1 tệp trước khi gửi
- `INPUT`: **cho phép 0 tệp**; duyệt tạo slot trống chính thức, không tạo document/link giả; ô bắt buộc vẫn chặn Node
- Chỉ `approved` mới sinh slot/link và vào hồ sơ chính thức

### Xin miễn
Nhân viên xin → Giám đốc duyệt/từ chối → có thể thu hồi. Thu hồi thì ô đòi lại **ngay**. Không xoá slot, không sửa mẫu, không đụng tài liệu gốc.

### Một object nhiều Hạng mục
Cùng một `dossier_documents` link vào slot của nhiều Hạng mục qua `dossier_document_links`. **Không** upload/copy lại. Không gán `dossier_documents.dossier_id` (cột chỉ chứa một giá trị).

### Thứ tự trạng thái UI (CHỐT CUỐI)
```
Đủ file hợp lệ                    → Đã đủ      (kèm nhãn phụ "Từng được miễn" nếu có)
Chưa đủ + miễn đang hiệu lực      → Đã được miễn
Chưa đủ + phiếu miễn pending      → Đang xin miễn
Bắt buộc + chưa đủ                → Thiếu
Không bắt buộc + chưa có          → Chưa có
```
Tài liệu thật **thắng** quyết định hành chính. Cài đặt: `trangThaiGiay()` trong `DocumentRegister.jsx`.

---

## 3. Database thực tế

### Bảng/cột mới trong EXPAND (CHƯA APPLY)

**`service_lines`**
- `document_register_version smallint NOT NULL DEFAULT 1` + CHECK `in (1,2)`
- **Cố ý KHÔNG map vào ORM** (xem mục 5)

**`document_template_applicabilities`** (mới)
```
id varchar PK
template_id varchar NOT NULL FK → document_checklist_templates(id) ON DELETE CASCADE
applicability_type varchar NOT NULL          -- GLOBAL | PACKAGE | TASK_TYPE
service_package_id varchar NULL FK → service_packages(id)
task_type_id       varchar NULL FK → task_types(id)
is_default boolean NOT NULL DEFAULT true
created_by varchar NULL
created_at timestamptz NOT NULL DEFAULT now()
```
- CHECK `document_template_applicabilities_shape_check`: GLOBAL → cả hai FK null; PACKAGE → chỉ `service_package_id`; TASK_TYPE → chỉ `task_type_id`
- Partial UNIQUE: `ux_tpl_app_global(template_id)`, `ux_tpl_app_package(template_id, service_package_id)`, `ux_tpl_app_task_type(template_id, task_type_id)`
- Index: `ix_tpl_app_package`, `ix_tpl_app_task_type`
- **Backfill**: `task_type_id` không null → `TASK_TYPE`; null → `GLOBAL`. Cột cũ `document_checklist_templates.task_type_id` **giữ nguyên, ngừng đọc**

**`document_slot_creation_requests`**
- `kind varchar NOT NULL DEFAULT 'OUTPUT'` + CHECK `in ('OUTPUT','INPUT')`
- status CHECK mở rộng: `draft | pending | needs_more | approved | rejected`

**`document_slot_change_requests`**
- `service_line_id varchar NULL FK → service_lines(id)` ← **nullable trong EXPAND**
- UNIQUE partial `ux_slot_waive_active (slot_id, coalesce(service_line_id,''))` where `kind='WAIVE' and status='approved' and revoked_at is null`
- Index `ix_slot_change_requests_service_line`

### Dự kiến NOT NULL trong CONTRACT
- `document_slot_change_requests.service_line_id` (qua CHECK `kind <> 'WAIVE' or service_line_id is not null`)
- `service_lines.document_register_version` đổi DEFAULT 1 → 2

### Quan hệ
```
service_lines ──1:N──> dossier_document_slots (scope='SERVICE_LINE')
contracts     ──1:N──> dossier_document_slots (scope='CONTRACT', legacy)
document_checklist_templates ──1:N──> document_template_applicabilities
                             ──1:N──> dossier_document_slots.template_id
dossier_document_slots ──N:M──> dossier_documents  (qua dossier_document_links)
document_slot_creation_requests ──1:N──> document_slot_creation_request_documents
document_slot_change_requests.slot_id → dossier_document_slots
document_slot_change_requests.service_line_id → service_lines
```

---

## 4. Migration và trình tự triển khai

```
1. apply EXPAND  20260826040000_template_applicabilities_and_register_v2.sql
2. deploy backend + frontend
3. RESTART backend            (bắt buộc — xem mục 5, cache dò schema)
4. reset schema cache          (restart đã đủ; hàm reset_schema_cache() để dự phòng)
5. smoke test DB / UI / SSE
6. DỪNG — xin duyệt
7. CONTRACT (đợt riêng)
```

**Rollback**: `20260826040000_..._down.sql`. Bị **chặn** khi còn: Hạng mục version 2 · phạm vi PACKAGE hoặc GLOBAL khai tay không tái tạo được từ cột cũ · phiếu `kind='INPUT'` hoặc `status='needs_more'`.

**Tuyệt đối chưa đưa vào hàng đợi**: cả 3 file trong `supabase/pending/`, đặc biệt `CHUA_DUYET_checklist_results_contract_id_contract.sql` (M0b).

---

## 5. Backend

### `dev/backend/src/dossiers/register.py` (untracked)
| Symbol | Trách nhiệm |
|---|---|
| `_co_cot_register_version` / `_co_cot_waiver_service_line` | Dò schema bằng `information_schema`. **Không** try/except quanh truy vấn nghiệp vụ — lỗi kết nối/quyền/timeout phải nổ |
| `reset_schema_cache()` | Xoá cache dò. **Restart backend sau EXPAND là bắt buộc** |
| `require_v2_schema(db)` | Cổng dùng chung cho **mọi** đường ghi V2 → 503 |
| `register_version(db, sl_id)` | Thiếu cột → trả 1 (legacy) |
| `applicable_templates(db, sl_id)` | Gộp theo `TASK_TYPE > PACKAGE > GLOBAL`, một dòng/template, `is_default` từ phạm vi cụ thể nhất **kể cả false** |
| `materialize_service_line_register(...)` | Chụp lựa chọn thành slot của đúng service_line. Idempotent |
| `request_slot_waiver(...)` | 6 cổng kiểm (mục dưới) |
| `revoke_slot_waiver(...)` | Theo cặp (slot, service_line) |
| `k01_blockers` | **HIGH risk** — 5 symbol phụ thuộc; đọc theo version, bỏ ô đã miễn |
| `_slots_query` / `_k01_slots_query` | Chọn biến thể SQL theo schema; hai nơi dùng **chung** `_ACTIVE_WAIVER_JOIN` |

### Route WAIVE (`routes_document_register.py`)
| Endpoint | Quyền | Gate |
|---|---|---|
| `POST /api/document-register/slots/{id}/waivers` | `get_current_user` + kiểm phân công **trong service layer** | `require_v2_schema` |
| `POST /api/document-register/waivers/{id}/review` | `task_node:approve` | `require_v2_schema`, chỉ `pending` |
| `POST /api/document-register/slots/{id}/waivers/revoke` | `task_node:approve` | `require_v2_schema` |
| `GET /api/document-register/service-lines/{id}/waivers` | `contract:read` | `require_v2_schema` |

Mẫu request tạo:
```json
POST /api/document-register/slots/S-1/waivers
{ "service_line_id": "SL-1", "reason": "Chủ đất độc thân, không có giấy kết hôn" }
```

**6 cổng của `request_slot_waiver`** (mọi ID đối chiếu lại ở server, chống IDOR):
1. Người dùng được phân công Node của đúng Hạng mục, **hoặc** là Giám đốc → 403
2. Ô thuộc hợp đồng của Hạng mục → 409
3. Ô phạm vi Hạng mục phải đúng Hạng mục đó → 409
4. Ô đang `is_required` → 409
5. Ô hiện còn thiếu tệp → 409
6. Chưa có phiếu `pending`/đang hiệu lực cho cùng (Hạng mục, ô) → 409
Lý do < 5 ký tự → 422.

> `service_line_id` client gửi **chỉ để biết người dùng đang đứng ở đâu**; server đối chiếu lại toàn bộ.

### `dev/backend/src/contracts/services.py`
- `phan_giai_lua_chon_giay(mode, ids)` — validate + trả sentinel/list; **gọi ở ĐẦU** `generate_and_save_contract`, trước mọi `db.add`
- `_create_initial_service_line(...)` — factory chung. **Không có default** cho `checklist_template_ids`. Trình tự: `require_v2_schema` → tạo → `flush` → `UPDATE ... document_register_version = 2` (SQL thuần) → materialize → audit. **Cùng transaction**
- `_materialize_so_giay_to(...)` — sentinel → `is_default=true`; list → đúng list

### Ba đường tạo `service_line` — TẤT CẢ đã khai mode tường minh
| Đường | Vị trí | Mode |
|---|---|---|
| `ContractService.create_contract` | `services.py` ~L491 | `phan_giai_lua_chon_giay("DEFAULT", None)` |
| `ContractService.generate_and_save_contract` | `services.py` ~L669 | từ payload (bắt buộc) |
| CRM lead → hợp đồng | `routes_crm.py` ~L182 | `phan_giai_lua_chon_giay("DEFAULT", None)` |

Không có `INSERT INTO service_lines` SQL thuần trong `src/` (chỉ `scripts/seed_test_data.sql`, không ai gọi).
**Không có API thêm Hạng mục vào hợp đồng đang tồn tại.**

### `dev/backend/src/dossiers/slot_requests.py` (untracked)
- `submit_request` — guard theo `kind`; đếm tệp cho cả hai, chỉ **ép buộc** với OUTPUT
- `review_request(..., promotion_scope=None)` — thêm nhánh `needs_more` (bắt buộc lý do, chưa tạo slot)
- `_so_cau_hinh_mau(...)` — so tên chuẩn hoá + `source` + `is_active` + `is_required` + `needs_original` + `default_quantity`. **Không** so `sort_order` (chỉ hiển thị) và `task_type_id` (đang được thay bằng applicabilities). `note` chỉ tính lệch khi cả hai đều có nội dung
- `_promote_theo_pham_vi(...)` — `None`/`HANG_MUC_NAY` → **không ghi applicability nào**

## Luồng miễn giấy — MỘT CỔNG Ở NGHIỆM THU (chốt 26/08/2026)

Người dùng chọn phương án một cổng. Nhân viên bấm "Xin miễn giấy này" là **nộp
được ngay**, Giám đốc nhìn trọn gói lúc nghiệm thu rồi quyết một lần:

```
nhân viên bấm miễn  → phiếu 'pending', THÔI chặn nộp K01
nộp hoàn thành      → chuông Giám đốc: "... · nhân viên xin bỏ N loại giấy"
Duyệt đạt           → mọi phiếu pending của Hạng mục → approved
Cần làm lại         → mọi phiếu pending → rejected, lý do trả lại ghi vào
                      review_note để nhân viên mang đi gọi khách
```

Hàng chờ duyệt vẫn quyết phiếu sớm được nếu Giám đốc muốn — cổng nghiệm thu chỉ
chốt những phiếu **còn pending**, nên không thành hai cổng.

### Bốn lỗi tìm được khi rà lại luồng này

1. **Cổng K01 ở "Nộp hoàn thành công việc" là truy vấn tự viết, sai ba đường** —
   chỉ đọc `scope='CONTRACT'` (Hạng mục V2 không hề bị kiểm), đọc `s.status` thay
   vì đếm liên kết, và **không biết phiếu xin miễn** nên giấy đã miễn vẫn chặn
   nộp vĩnh viễn. Giả định cũ "K01 auto-finalize nên không ai bấm nút này" sai:
   bước K01 không có checklist thì nhân viên bấm đúng nút đó. Đã gộp về
   `k01_blockers`.
2. **Chuông Giám đốc không có mục nào cho phiếu xin miễn.** Đã thêm số phiếu vào
   nhãn dòng "chờ duyệt nghiệm thu".
3. **Điều kiện "đang xin miễn" không lọc theo Hạng mục** → Hạng mục B mất nút xin
   miễn chỉ vì A vừa gửi phiếu trên ô dùng chung. Đã lọc.
4. **`uq_document_slot_change_one_pending` còn khoá theo `slot_id` đơn thuần** —
   hai Hạng mục không cùng có phiếu chờ trên một ô dùng chung, và INSERT vỡ thành
   500. Đã chặn trước bằng 409 có lời giải thích; bản vá chỉ số nằm ở
   `supabase/pending/CHUA_DUYET_pending_waiver_theo_hang_muc.sql` — **CHƯA CHẠY**.

### Bảng `public.notifications` là mã chết

5 chỗ `insert into public.notifications` trong `workflow_runtime.py`,
`handover.py`, `register.py` — **không nơi nào SELECT bảng này**. Live có đúng 1
dòng chưa đọc từ 24/08. Chuông thật (`/api/notifications/summary`) dựng hoàn toàn
bằng truy vấn suy ra, không đọc bảng. Nhân viên vẫn nhận được tin "bị yêu cầu làm
lại" qua `_EMPLOYEE_NODE_START_QUERY` (`n.status in ('ready','rework_required')`),
nên luồng không gãy — nhưng mọi câu chữ soạn trong các `insert` đó rơi vào hư
không. **Chưa dọn** — cần quyết: hoặc cho chuông đọc bảng, hoặc xoá các insert.

### SSE — đã kiểm chứng thật 26/08/2026

Ba tài khoản (`admin`, `nguyenvana`, `myhang`) mở đồng thời
`GET /api/employee-portal/events`; phát **một** sự kiện lên Redis:

```
không token   -> 401
token rác     -> 401
nguyenvana    -> connected · keep-alive · employee-task-change
myhang        -> connected · keep-alive · employee-task-change
admin         -> connected · keep-alive · employee-task-change
```

`admin` **không có dòng `employees`** mà vẫn nhận được — đúng mục đích của lần bỏ
gate hồ sơ nhân sự; lỗi 404 lặp 1,5 giây/lần trước đây không tái diễn.

Payload luôn là `data: {}`. Stream chỉ báo "có gì đó đổi", client tự đọc lại phần
dữ liệu nó được phép — không có dữ liệu nghiệp vụ nào đi qua Redis.

Chặng cuối (sự kiện → UI nạp lại) đo trên trình duyệt, đăng nhập `nguyenvana`,
màn **Lịch trình**, bọc `window.fetch`:

```
12 giây yên lặng          -> 0 lệnh gọi của màn Lịch trình
phát 1 sự kiện            -> me · task-pool · daily-summary · completed-items
                             + notifications/summary
```

Không có polling ở màn này. (Nhiễu duy nhất là `pages/Tasks.jsx` poll
`/api/survey-records` mỗi 8 giây — app giữ mọi trang mounted nên nó chạy cả khi
đang xem trang khác. Có sẵn từ trước, chưa chuyển sang SSE.)

### SSE
Mọi route publish **sau** `db.commit()`, ngoài `try/except`. Không polling.

### Fallback còn giữ lại
`_co_cot_*`, `reset_schema_cache`, `require_v2_schema`, hai biến thể SQL — **không phải mã tạm**, giữ cho rollback và môi trường mới.

---

## 6. Frontend

### `dev/frontend/src/lib/schemaV2.js` (mới)
`THONG_BAO_CHUA_KICH_HOAT` · `laLoiChuaKichHoat(err)` · `loiHienThi(err, macDinh)`.
503 → *"Tính năng sổ tài liệu V2 chưa được kích hoạt. Vui lòng liên hệ quản trị."* Lỗi khác **giữ nguyên** thông điệp server.

### `ContractComposer.jsx` (modified)
- State `cheDoGiay` (`''` ban đầu — **không tick sẵn**), `loaiGiay`, `loaiGiayChon`, `khoaV2`
- Nạp `GET /api/document-register/checklist-options` khi mở form; 503 → set `khoaV2`, phần còn lại vẫn dùng
- `cheDoGiay` là trường **bắt buộc** trong `requiredFields`
- Gửi `document_selection_mode` + `document_template_ids`

### `DocumentRegister.jsx` (untracked — file lớn, kế thừa sẵn có)
- `trangThaiGiay(slot)` — export, có test riêng
- State mới: `phienBanSo`, `khoaV2`, `xinMienId`, `slotXinMien`
- Chip trạng thái + nhãn phụ "Từng được miễn"
- Nút **"Xin miễn giấy này"** → `Modal` tiêu đề *"Gửi yêu cầu xin miễn giấy tờ"* (đã bỏ `window.prompt`)
- Điều kiện hiện nút: `phienBanSo===2 && !khoaV2 && slot.is_required && !is_waived && !waiver_pending && file_count===0 && serviceLineId`
- Reload bằng `load()` sau khi gửi; SSE sẵn có, không polling

### Đã kiểm bằng mắt
- Form Hạng mục ba chế độ — **CHƯA** (chỉ có test)
- Sổ giấy hợp đồng 002: 3 chip "Thiếu" + 3 "Chưa có" — **ĐÃ** (`scratchpad/anh-ui/m2-so-giay.png`)
- Màn hẹp 700px: `scrollWidth = clientWidth = 700`, 0 tràn — **ĐÃ**
- Hạng mục V2 thật — **CHƯA KIỂM CHỨNG** (không có V2 nào trước EXPAND)

### Màn còn thiếu
- **Màn 3 hàng chờ Giám đốc** — chưa bắt đầu
- **UI promotion theo phạm vi** — backend xong, chưa có UI
- **Nút đề xuất loại tài liệu + needs_more** trong workspace — chưa nối
- Thông báo 503 — đã có ở composer và workspace; **chưa** có ở màn 3

---

## 7. Việc Codex phải làm tiếp

- [x] ~~**Nối nút "Đề xuất loại tài liệu" vào `DocumentRegister.jsx`**~~ — XONG
      Xong khi: mở modal đặt tên/mô tả/nguồn/lý do · gửi được với **0 tệp** (INPUT) · `draft` sửa được, `pending` khoá · test khẳng định đề xuất chưa duyệt không xuất hiện trong danh sách slot chính thức
- [x] ~~**UI `needs_more`**~~ — XONG trong `SlotRequestModal.jsx`
      Xong khi: hiện lý do của Giám đốc · sửa và gửi lại **cùng `request_id`** (test khẳng định id không đổi) · `rejected` cũng gửi lại được
- [x] ~~**Màn 3 — hàng chờ Giám đốc**~~ — XONG
      Xong khi: duyệt/từ chối/`needs_more` · duyệt/từ chối WAIVE kèm lý do · chọn phạm vi promotion mặc định **"Chỉ Hạng mục này"** · 503 hiện câu tiếng Việt · không polling
- [x] ~~**5 test DB thật**~~ — XONG, xem `tests/test_so_giay_to_db_that.py`
- [x] ~~**Apply EXPAND**~~ — XONG 26/08, smoke test 9/9
- [x] ~~**Chụp ảnh V2 thật**~~ — XONG (`scratchpad/anh-ui/v2-*.png`)
- [x] ~~**Kiểm chứng SSE hai tài khoản**~~ — XONG 26/08, 3 tài khoản cùng nhận một sự kiện
- [ ] **Xin duyệt riêng trước CONTRACT**
- [ ] **Chạy `detect_changes`** và tách riêng file của tính năng này

---

## 8. Test và baseline

### ⚠️ BẮT BUỘC LÀM TRƯỚC: dựng schema cho DB test

`bachkhoa_test` mặc định chỉ có bảng từ **model SQLAlchemy**. Toàn bộ sổ giấy tờ
lại tạo bằng **SQL thuần**, và bốn bảng nền (`legal_dossiers`, `dossier_documents`,
`task_nodes`, `task_node_checklist_results`) **không có file migration nào** —
chúng chỉ tồn tại trên live. Vì thế `supabase/migrations/` **không dựng lại được
schema**, và mọi kiểm thử chạm sổ giấy tờ sẽ SKIP — nhìn "xanh" nhưng chưa chạy.

Cách dựng (chỉ đọc live, ghi vào DB test cục bộ):

```bash
# 1. Dump schema từ live — pg_dump phải CÙNG major version (live = PG 17)
URL=$(docker exec bachkhoa-erp-dev-backend-1 sh -c 'printf %s "$DATABASE_URL"' \
      | sed 's|postgresql+psycopg2://|postgresql://|')
docker run --rm --network container:bachkhoa-erp-dev-backend-1 -e PGURL="$URL" \
  postgres:17-alpine sh -c 'pg_dump --schema-only --no-owner --no-privileges \
  --schema=public "$PGURL"' > /tmp/live_schema.sql

# 2. Nạp vào DB test
docker exec bachkhoa-pg-test psql -U postgres -c "drop database if exists bachkhoa_test"
docker exec bachkhoa-pg-test psql -U postgres -c "create database bachkhoa_test"
docker exec bachkhoa-pg-test psql -U postgres -d bachkhoa_test \
  -c "create extension if not exists pgcrypto; create extension if not exists vector;"
docker cp /tmp/live_schema.sql bachkhoa-pg-test:/tmp/live_schema.sql
docker exec bachkhoa-pg-test psql -U postgres -d bachkhoa_test -f /tmp/live_schema.sql

# 3. Chồng EXPAND (live CHƯA có, nên DB test phải tự thêm)
docker cp supabase/migrations/20260826040000_template_applicabilities_and_register_v2.sql \
  bachkhoa-pg-test:/tmp/expand.sql
docker exec bachkhoa-pg-test psql -U postgres -d bachkhoa_test -f /tmp/expand.sql
```

Lưu ý:
- `pg_dump` 16 **không** dump được PG 17 → phải dùng image `postgres:17-alpine`
- `bachkhoa-pg-test` dùng chung netns với backend nên nối được Supabase
- **Chỉ đọc live.** Không `pg_restore`, không ghi ngược
- `conftest.py` đã được sửa: **không** `drop_all` khi phát hiện schema dựng từ dump
  (nếu không, teardown chết vì phụ thuộc FK và che mất kết quả cả phiên)
- `dev/backend/scripts/dung_schema_test.py` chạy migration theo vòng lặp — **không đủ**,
  giữ lại để tham khảo; đường dump ở trên mới là đường dùng được

### Lệnh chạy (Docker)
`/app/tests` **KHÔNG mount** — phải copy vào:
```bash
docker cp dev/backend/tests/. bachkhoa-erp-dev-backend-1:/app/tests/
docker restart bachkhoa-pg-test && sleep 8
docker exec -e PYTHONPATH=/app \
  -e TEST_DATABASE_URL="postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/bachkhoa_test" \
  -w /app bachkhoa-erp-dev-backend-1 \
  python -m pytest tests -q --continue-on-collection-errors -p no:cacheprovider
```
`bachkhoa-pg-test` dùng chung netns với backend → **restart sau mỗi lần restart backend**.

Frontend: `cd dev/frontend && npx vitest run` · build: `npx vite build`

### Kết quả gần nhất — SAU khi dựng schema đúng
```
Backend : 2 failed, 485 passed, 0 skipped, 2 errors
Frontend: 153 passed / 36 files
Build   : ✓ (cảnh báo chunk >500kB, có sẵn)
```

**9 trong 11 "lỗi baseline" cũ biến mất** khi DB test có schema thật — chúng là
drift schema, không phải lỗi code. Đừng dùng con số cũ (11 failed) làm mốc nữa.

### Baseline mới — 2 failed + 2 errors (CÓ SẴN, ngoài phạm vi tính năng này)
```
FAILED tests/test_contracts.py::test_create_contract
        payload thiếu contract_template_id — test cũ chưa cập nhật
FAILED tests/test_permission_matrix.py::test_shadow_decision_never_overrides_legacy_authorization
ERROR  tests/test_employee_portal.py   ImportError: cannot import name 'KpiPayroll' from 'src.db.models'
ERROR  tests/test_models.py            ImportError: cannot import name 'TaskTypeRate' from 'src.db.models'
```
Hai `ImportError` là drift giữa test và model, **không** phải schema — sửa được
độc lập, không thuộc tính năng này.

### Test mới
| File | Loại |
|---|---|
| `tests/test_schema_gate_v2.py` (27) | mock — cổng 503, quyền WAIVE, giao thức mode, giao dịch 422 |
| `tests/test_de_xuat_input_va_promotion.py` (19) | mock — guard kind, promotion phạm vi, so cấu hình mẫu |
| `tests/test_mien_giay_to.py` (8) | **DB thật**, tự dò schema → hiện đang **SKIP** (thiếu bảng) |
| `tests/test_dossier_documents_unittest.py` (bổ sung) | mock — k01 theo version, ô miễn |
| `src/lib/schemaV2.test.js` (3) | frontend |
| `src/features/document-register/trangThaiGiay.test.js` (7) | frontend |
| `src/features/contracts/ContractComposer.test.jsx` (bổ sung 4) | frontend |

### 5 test DB thật — ĐÃ XONG
`dev/backend/tests/test_so_giay_to_db_that.py` (8 ca, **chạy thật, không skip**):
1. ✅ Materialize đúng danh sách chọn · `[]` → 0 slot và **vẫn là V2** · sentinel chỉ lấy `is_default=true`
2. ✅ Materialize lỗi → rollback, không để lại ô nào
3. ✅ Sửa mẫu sau đó **không** đổi Hạng mục V2 đã materialize (ô runtime đã đóng băng)
4. ✅ Một object link hai Hạng mục — 1 `dossier_documents`, 1 `object_key`, 2 link
5. ✅ WAIVE Hạng mục A **không** ảnh hưởng Hạng mục B (ô cấp Hợp đồng dùng chung), và B vẫn xin riêng được
+ chống xin miễn trùng cho cùng Hạng mục

`dev/backend/tests/test_mien_giay_to.py` (8 ca) **cũng đã hết skip** — setUp tự
dựng dữ liệu thay vì đi tìm dữ liệu có sẵn.

Fixture dùng chung: `dev/backend/tests/fixtures_so_giay_to.py` — mỗi test tự dựng
hợp đồng/Hạng mục/mẫu/ô/tệp rồi rollback, chạy được trên DB trống.

---

## 9. Git và worktree

`git status --short`: **202 dòng** · `git diff --stat`: **58 files, +10153 −1501**
Worktree **trộn nhiều phiên** — con số tổng không dùng để đánh giá tính năng này.

### Thuộc tính năng này
Modified: `contracts/schemas.py` · `contracts/services.py` · `db/models/crm.py` · `routes/routes_crm.py` · `tests/test_contract_template_selection.py` · `ContractComposer.jsx` · `ContractComposer.test.jsx` · `contractComposer.css`

Untracked (từ phiên trước, chưa từng commit): `dossiers/register.py` · `dossiers/slot_requests.py` · `dossiers/documents.py` · `routes_document_register.py` · `routes_slot_requests.py` · `features/document-register/`

Mới trong phiên này: `lib/schemaV2.js(.test)` · `tests/test_schema_gate_v2.py` · `tests/test_de_xuat_input_va_promotion.py` · `trangThaiGiay.test.js` · 2 migration `20260826040000_*` · 2 file `supabase/pending/CHUA_DUYET_{waive,register}*` · 3 doc

### Của phiên/agent khác — KHÔNG ĐỤNG
`dossiers/handover.py` và các migration `20260821*`–`20260825063758*`.
**Không tự commit / reset / checkout / xoá thay đổi của agent khác.**

---

## 10. GitNexus

- Index: `bachkhoa-erp` (6456 symbols) — **có thể đã cũ**, chạy lại `node .gitnexus/run.cjs analyze` trước khi tin
- Impact đã chạy: `k01_blockers` **HIGH** (5 symbol, chạm `submit_checklist_evidence` + `submit_checklist_output_document`) · `_held_items` LOW · `get_task_pool` LOW · `open_contract_register` LOW · `ServiceLine` MEDIUM (53)
- **Điểm mù**: GitNexus báo 0 caller cho lời gọi `module.func()`. **Luôn đối chiếu grep.** Ví dụ thật: `ServiceLine(` chỉ tìm ra bằng grep
- `detect_changes` gần nhất: **critical, 370 symbol / 55 file** — vô nghĩa vì worktree trộn nhiều phiên; phải lọc theo danh sách mục 9
- **Chạy lại impact trước khi sửa**: `k01_blockers`, `review_request`, `_create_initial_service_line`, `request_slot_waiver`

---

## 11. Bằng chứng cuối

### Ảnh
`/private/tmp/claude-501/-Users-macos-WIFIM-bachkhoa-erp/4697e030-5f5b-4a8a-8423-958c2d85ab00/scratchpad/anh-ui/`
- `v2-form-3che-do.png` — **SAU EXPAND, dữ liệu THẬT**: ba chế độ, không cái nào tick sẵn, nhãn "Sổ theo Hạng mục"
- `v2-thu-cong.png` — chế độ thủ công, 6 loại giấy của gói Đo Vẽ / Cắm mốc
- `v2-man-hep.png` — 700px, `scrollWidth = clientWidth = 700`, 0 phần tử tràn
- `m2-desktop.png`, `m2-so-giay.png` — sổ giấy hợp đồng 002 (Hạng mục V1)
- `mgt-final.png`, `mgt-final2.png` — màn Mẫu Giấy Tờ sau thiết kế lại
- **CHƯA CÓ** ảnh màn 3 có phiếu thật (hàng chờ đang trống)

### SQL đối soát (chỉ đọc)
Xem mục 1. Truy vấn dùng `information_schema` + `count(*)`, không sửa dữ liệu.

### Diễn tập migration
`bachkhoa-pg-test`, database `dt2`/`dt3` (đã xoá). 20 phép đạt: backfill · FK thật chặn gói không tồn tại · shape check · version CHECK · **cô lập miễn theo Hạng mục** (miễn SL-1 → SL-2 vẫn đòi) · `kind`/`needs_more` · rollback bị chặn đúng lúc. Chạy 2 lần idempotent.

### CHƯA KIỂM CHỨNG
- Smoke test live sau EXPAND
- Log SSE cho luồng WAIVE/đề xuất
- Hành vi V2 trên dữ liệu thật
- Materialize thật (mới chỉ mock + diễn tập SQL)
- Ảnh form Hạng mục ba chế độ
