# Tài liệu đầu ra theo Checklist — Thiết kế đã chốt

*2026-08-25. **Chưa sửa dòng code nào. Migration đã viết + diễn tập cục bộ, CHƯA apply Supabase.***

> **Nguyên tắc trên hết:** tệp chỉ lưu **một lần**. Checklist, loại giấy và Hạng mục
> chỉ tạo **quan hệ trỏ tới** tệp đó. Nhờ vậy không upload trùng, và đổi phân loại
> về sau không phải di chuyển object.

---

## 1. Cờ hiện tại — đã có đủ, không cần thêm

Cả ba cờ nằm trong định nghĩa Node của graph (`workflow_instance_revisions.graph -> nodes -> {node_key}`), không phải cột bảng:

| Cờ | Sinh ra gì | Hàm | Chống trùng |
|---|---|---|---|
| `creates_survey_record` | 1 dòng `survey_records` | [`_maybe_create_survey_record`](../dev/backend/src/contracts/workflow_runtime.py#L2203) | `select ... where service_line_id = :x limit 1` **trước** khi insert |
| `requires_gov_submission` | `legal_dossiers` + `legal_submissions` | [`_maybe_create_legal_submission`](../dev/backend/src/contracts/workflow_runtime.py#L2113) | như trên, **cộng** chặn theo `service_package_id != LEGAL_PACKAGE_ID` |
| `is_handover` | cổng công nợ K06 | `auto_finalize_node_if_ready` | — |

Điều phối viên là [`_ensure_node_module_records`](../dev/backend/src/contracts/workflow_runtime.py#L2249), chạy khi Node vào `ready`, có `for update` trên `task_nodes`.

> **Yêu cầu "chống tạo record trùng khi revisit/reopen/rollback" của bạn đã được đáp ứng sẵn.** Chốt chặn là `service_line_id`, không phải `task_node_id` — nên bật cờ ở ba Node vẫn ra đúng một hồ sơ. `legal_dossiers` còn có `on conflict (service_line_id) do update`. Không cần làm gì thêm ở phần này.

---

## 2. Schema thật (đọc live Supabase `ejklrwydjplwzztfuygj`)

### Có thật

| Bảng | Cột đáng chú ý |
|---|---|
| `task_node_checklist_results` | `checklist_key`, `checklist_name`, `is_required`, `status`, **`evidence_data jsonb NOT NULL`**, `require_evidence`, `approver_role`, `is_overdue`, `late_reason`, `submitted_by/at` |
| `dossier_documents` | `contract_id!`, `service_line_id`, `task_node_id`, **`slot_id`**, `scope`, **`stage!`**, `object_key! unique`, `checksum_sha256`, **`revision_no!`**, **`supersedes_id`**, **`doc_status!`** |
| `dossier_document_slots` | `scope`, `contract_id!`, `service_line_id`, `template_id`, `name`, `source`, `is_required`, `quantity`, `status`, `storage_location_id` |
| `dossier_document_links` | `contract_id!`, `document_id!`, `slot_id!`, `link_status`, unique `(document_id, slot_id)`, FK ghép chặn nối chéo Hợp đồng |
| `survey_records` | `task_node_id!`, `service_line_id!`, `contract_id!`, `dossier_name`, `ward_code`, `priority`, `manual_status` |
| `legal_dossiers` / `legal_submissions` | vòng đời hồ sơ nộp + từng lần nộp (`submit_seq`) |
| `workflow_nodes` | `code`, `name`, `checklist_template jsonb` |

### KHÔNG tồn tại — cần đính chính tài liệu

**Không có bảng `task_node_checklists`.** Định nghĩa checklist chỉ sống ở hai nơi:

1. `workflow_nodes.checklist_template` (jsonb) — bộ mẫu;
2. `workflow_instance_revisions.graph -> nodes -> {node_key} -> checklist[]` — bản đang chạy.

Bản thể hiện là `task_node_checklist_results`. Nên **cấu hình "tài liệu đầu ra" phải đi vào graph**, không có bảng nào để thêm cột.

---

## 3. Quan hệ hiện tại — và chỗ đứt

```
Checklist result ──evidence_data.files[] (jsonb: name/url/note)──► object trên MinIO
                                                                      ▲
                                                                      │  KHÔNG có liên kết
                                                                      ▼
dossier_documents ──slot_id / dossier_document_links──► dossier_document_slots ──► Hạng mục
```

**Đây là chỗ đứt duy nhất, và nó đúng như bạn lo.**

File nộp làm minh chứng đi qua [`routes_employee_portal.py:340`](../dev/backend/src/routes/routes_employee_portal.py#L340): upload lên `contracts/{c}/service-lines/{sl}/nodes/{node}/{file}` rồi **chỉ** append `{name, url, note, submitted_at}` vào `evidence_data.files[]`. Nó **không** tạo dòng `dossier_documents` nào.

Hệ quả hôm nay: muốn một tờ vừa là minh chứng vừa nằm trong hồ sơ có cấu trúc thì **phải upload hai lần, thành hai object**. Đúng thứ nghiệp vụ cấm.

Chiều ngược lại cũng đứt: từ một `dossier_documents` không truy ngược được checklist nào đã sinh ra nó — cần cho lịch sử duyệt/từ chối.

---

## 4. Cái gì tái sử dụng được (nhiều hơn dự kiến)

| Yêu cầu của bạn | Đã có sẵn |
|---|---|
| Danh mục "Loại tài liệu" cho dropdown | `document_checklist_templates` (31 dòng) → `open_service_line_register` đổ ra `dossier_document_slots` theo đúng thủ tục. Ảnh 2 của bạn chính là bảng này: *Công ty soạn/lập*, *Cơ quan Nhà nước trả* |
| Không cho gõ tên giấy tuỳ tiện | Dropdown lấy từ danh mục trên |
| Giữ lịch sử revision | `revision_no`, `supersedes_id`, unique `supersedes_id` (cấm rẽ nhánh) — có từ Nhóm A |
| Từ chối nhưng không xoá file | `doc_status = 'KHONG_HOP_LE'`; nộp bản mới → dòng mới `supersedes_id` trỏ về bản cũ |
| Một file dùng nhiều Hạng mục, không copy | `dossier_document_links` + FK ghép |
| Chặn upload sai Hợp đồng | FK ghép `(document_id, contract_id)` / `(slot_id, contract_id)` — **đã chặn ở tầng DB**, không lách được |
| Node sau xem tài liệu Node trước | `_inherit_predecessor_evidence` + `dossier_documents` theo `service_line_id` |
| Storage | `storage_service.py`, MinIO dev / R2 prod |
| Gate auto-finalize | `auto_finalize_node_if_ready` đã có chỗ cắm điều kiện |

**K01 link/unlink/k01-status đã được agent trước làm xong** (`register.link_source_document`, `unlink_source_document`, `k01_blockers`, 3 endpoint). Tôi không đụng vào và không nhận công.

---

## 5. Schema đã đủ chưa — thiếu đúng 2 thứ

### Thiếu 1 · bảng nối `checklist_result_document_links`

*(Thay cho đề xuất `dossier_documents.checklist_result_id` ở bản trước — bản đó sai.)*

Một cột chỉ chứa được **một** giá trị nên diễn tả sai cả hai chiều:

- Một checklist đòi **nhiều** tài liệu — K02 cần ảnh hiện trạng **và** toạ độ GPS **và** bản kỹ thuật gốc.
- Một tài liệu phục vụ **nhiều** checklist ở nhiều Node — K03 dùng lại bản kỹ thuật gốc của K02.

Đã rà toàn bộ schema: **không có bảng nối tương đương để tái dùng.**
`dossier_document_links` là tài liệu × **ô giấy** (phân loại);
`task_node_checklist_assignments` là checklist × **nhân viên** (khoán);
`work_pay_entitlements` có `checklist_result_id` nhưng là bảng lương.
Ba bảng, ba nghĩa khác nhau — không cái nào gánh được quan hệ này.

### Thiếu 2 · `stage` không có giá trị cho K02

`dossier_documents.stage` là **NOT NULL** với CHECK 5 giá trị:
`ho-so-goc`, `chuan-hoa-ky-thuat`, `soan-ho-so`, `nop-co-quan`, `ket-qua`.

`STAGE_BY_NODE_CODE` chỉ ánh xạ K03→K06. **K02 (đo hiện trường) không có stage.** Mà K02 chính là ví dụ đầu tiên trong yêu cầu của bạn (ảnh hiện trạng, toạ độ GPS, bản kỹ thuật gốc).

Nhồi đầu ra K02 vào `chuan-hoa-ky-thuat` sẽ làm đầu ra K02 và K03 **không phân biệt được bằng stage** — đúng điều bạn cấm ("K03 không được ghi đè K02"). Slot vẫn tách chúng ra, nhưng để hai bước khác nhau chung một stage là gieo nhầm lẫn cho người đọc sau.

Đề xuất: thêm `do-hien-truong` vào CHECK.

### Không cần thêm gì khác

Không cần bảng mới. Không cần cột cho `min_count`, `required_before_submit`, `needs_director_approval` — chúng là **cấu hình**, thuộc graph.

---

## 6. Migration — đã viết, đã diễn tập, CHƯA APPLY

| # | File | Bản lùi |
|---|---|---|
| **M0** | `supabase/migrations/20260825085000_checklist_results_contract_id.sql` | `supabase/rollback/..._down.sql` |
| M1 | `supabase/migrations/20260825090000_checklist_result_document_links.sql` | `supabase/rollback/..._down.sql` |
| M2 | `supabase/migrations/20260825091000_dossier_stage_do_hien_truong.sql` | `supabase/rollback/..._down.sql` |

Thứ tự lên: **M0 → M1 → M2**. Thứ tự lùi: **M1 → M0**, M2 độc lập.

### M0 · `task_node_checklist_results.contract_id`

Bạn đúng: khoá ngoại ghép chỉ ở phía tài liệu là **chưa đủ** — nó mới chứng minh tài
liệu thuộc hợp đồng nào, chưa nói gì về checklist. Phải để **cả hai phía** dùng chung
cột `contract_id` thì DB mới chặn được "checklist HĐ004 nối tài liệu HĐ003".

Preflight dừng migration nếu có bất kỳ dòng nào không suy ra được hợp đồng, và **nêu
đích danh record** — không tự đoán:

```sql
select r.id as result_id, r.task_node_id,
       case when n.id  is null           then 'không tìm được task node'
            when wi.id is null           then 'không tìm được workflow instance'
            when sl.id is null           then 'không tìm được service line'
            when sl.contract_id is null  then 'service_lines.contract_id là null'
       end as ly_do
from public.task_node_checklist_results r
left join public.task_nodes n          on n.id  = r.task_node_id
left join public.workflow_instances wi on wi.id = n.workflow_instance_id
left join public.service_lines sl      on sl.id = wi.service_line_id
where n.id is null or wi.id is null or sl.id is null or sl.contract_id is null;
```

Cộng một kiểm nữa: một result cho ra nhiều hợp đồng. Chuỗi khoá ngoại vốn nhiều-một nên
chuyện đó không xảy ra được — để đó phòng khi mai kia ai đổi quan hệ thì migration gãy
ngay thay vì gán bừa.

Sau backfill: hậu kiểm `contract_id is null` → `set not null` → FK `contracts(id)` →
unique `(id, contract_id)`.

**Kết quả preflight trên Supabase live (chỉ đọc):** 20/20 dòng suy ra được hợp đồng, cả
5 loại lỗi đều bằng 0. Backfill sẽ sạch.

**Không làm việc xoá hợp đồng khó hơn:** chuỗi
`checklist_results → task_nodes → workflow_instances → service_lines → contracts`
vốn đã `RESTRICT` / `NO ACTION` toàn bộ.

### M1 · bảng nối `checklist_result_document_links`

```sql
create table if not exists public.checklist_result_document_links (
  id varchar primary key default gen_random_uuid()::text,
  contract_id varchar not null references public.contracts(id) on delete restrict,
  checklist_result_id varchar not null,
  document_id varchar not null,
  created_by varchar references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index uq_checklist_result_document_pair
  on public.checklist_result_document_links (checklist_result_id, document_id);
-- KHÔNG tạo index riêng theo checklist_result_id: unique ở trên đã có nó ở vị trí
-- đầu, thêm nữa là trùng chức năng.
create index checklist_result_document_links_document_idx
  on public.checklist_result_document_links (document_id);

-- Chặn nối chéo Hợp đồng bằng CẤU TRÚC, HAI PHÍA, không trigger.
alter table public.checklist_result_document_links
  add constraint checklist_result_document_links_checklist_fk
  foreign key (checklist_result_id, contract_id)
  references public.task_node_checklist_results (id, contract_id) on delete cascade;

alter table public.checklist_result_document_links
  add constraint checklist_result_document_links_document_fk
  foreign key (document_id, contract_id)
  references public.dossier_documents (id, contract_id) on delete restrict;

alter table public.checklist_result_document_links enable row level security;
```

Hai chiều xoá cố ý khác nhau:
`checklist_result_id` → **cascade** (checklist mất thì quan hệ vô nghĩa);
`document_id` → **restrict** (tệp không được biến mất khi còn ai trỏ tới).

RLS bật, **không** cấp GRANT cho anon/authenticated, **không** viết policy — đồng bộ với
các bảng nghiệp vụ khác. Không đụng RLS/GRANT của bảng nào cũ.

### M2 · thêm stage `do-hien-truong`

```sql
alter table public.dossier_documents drop constraint if exists dossier_documents_stage_check;
alter table public.dossier_documents add constraint dossier_documents_stage_check
  check (stage in ('ho-so-goc', 'do-hien-truong', 'chuan-hoa-ky-thuat',
                   'soan-ho-so', 'nop-co-quan', 'ket-qua'));
```

- `K02 → do-hien-truong` — ảnh hiện trạng, toạ độ GPS, số liệu đo, bản kỹ thuật gốc.
- `K03 → chuan-hoa-ky-thuat` — bản vẽ và tài liệu kỹ thuật đã xử lý, chuẩn hoá.

**Bản lùi M2 cố ý thất bại** nếu còn dòng mang stage mới. Tự động đổi chúng sang giai
đoạn khác là đoán hộ người dùng tài liệu K02 thuộc về đâu. Kiểm trước bằng
`select count(*) ... where stage = 'do-hien-truong'`.

### Kết quả diễn tập trên `bachkhoa-pg-test`

Dựng lại hình dạng thật các bảng liên quan (gồm cả Nhóm A), rồi chạy.

**Preflight — dừng đúng lúc phải dừng.** Gieo một dòng mồ côi (`service_lines.contract_id`
null), migration dừng và nêu đích danh:

```
ERROR: PREFLIGHT THẤT BẠI — 1 dòng không suy ra được hợp đồng:
  - checklist_result CR-MOCOI (task_node TN-MOCOI): service_lines.contract_id là null
Sửa dữ liệu rồi chạy lại. Migration KHÔNG tự đoán hợp đồng.
```

Cột `contract_id` **không** được tạo ra — cả migration cuộn lại.

**Sau khi dọn dữ liệu, chạy đủ chuỗi:**

| Ca | Kết quả |
|---|---|
| Backfill | `CR-K02 → 003/BK-2026`, `CR-X → 004/BK-2026` |
| Nối hợp lệ (cùng HĐ003) | thành công |
| **Checklist HĐ004 + tài liệu HĐ003, khai `contract_id`=003** | chặn — `..._checklist_fk` |
| **Checklist HĐ004 + tài liệu HĐ003, khai `contract_id`=004** | chặn — `..._document_fk` |
| Nối trùng cặp | chặn — `uq_checklist_result_document_pair` |
| Xoá tài liệu khi checklist còn trỏ tới | chặn — `..._document_fk` |
| Xoá checklist result | quan hệ **cascade** đi, **tệp ở lại** |
| Xoá user | `created_by` → null, dòng nối vẫn còn |
| RLS bảng nối | `true`, 0 policy, 0 GRANT |
| Index | đúng 3: pkey, unique cặp, document_idx |

Hai ca in đậm là **hai đường lách mà thiết kế M1 cũ không chặn được** — nay bị chặn ở
cả hai phía.

**up → down → up sạch**, backfill lại đúng 2 dòng, 0 null. Bản lùi M2 thất bại đúng như
thiết kế khi còn dòng `do-hien-truong`, chạy được sau khi dọn.

---

## 7. Cấu hình đề xuất — đặt trong graph

```json
{
  "key": "ban_ky_thuat_goc",
  "name": "Bản kỹ thuật gốc",
  "require_evidence": true,
  "output_documents": [
    {
      "template_id": "<document_checklist_templates.id>",
      "min_count": 1,
      "required_before_submit": true,
      "needs_director_approval": true
    }
  ]
}
```

**Vì sao `template_id` chứ không phải `slot_id`:** graph là của **mẫu quy trình**, dùng chung cho mọi Hạng mục. `slot_id` là bản thể hiện riêng của một Hạng mục. Nhúng `slot_id` vào graph là gắn cứng mẫu vào một Hạng mục — sai ngay ở Hạng mục thứ hai.

Lúc chạy mới phân giải:

```sql
select id from public.dossier_document_slots
where template_id = :template_id
  and (service_line_id = :service_line_id or scope = 'CONTRACT')
  and contract_id = :contract_id
```

Không tìm thấy slot ⇒ **báo lỗi cấu hình rõ ràng**, không im lặng bỏ qua (im lặng = checklist tưởng đã đủ nhưng hồ sơ trống).

### Kiểm ở `_validate_graph_payload`

Hàm này hiện dùng `normalized_item = {**raw_item, ...}` nên **khoá lạ lọt qua mà không
được kiểm**. Sẽ chuẩn hoá `output_documents` tường minh, chỉ nhận đúng bốn field khai
báo và từ chối phần còn lại:

| Kiểm | Lỗi khi sai |
|---|---|
| `template_id` tồn tại trong `document_checklist_templates` và đang `is_active` | `Node K02: checklist "Bản kỹ thuật gốc" trỏ tới loại tài liệu không tồn tại` |
| `min_count` là số nguyên `>= 1` | `... số lượng tối thiểu phải từ 1 trở lên` |
| `required_before_submit`, `needs_director_approval` đúng kiểu boolean | `... cấu hình tài liệu đầu ra không hợp lệ` |
| Không trùng `template_id` trong cùng một checklist | `... một loại tài liệu chỉ được khai một lần` |
| Field lạ ngoài bốn field trên | bị loại bỏ, không ghi vào graph |

---

## 8. Luồng dữ liệu — một object, nhiều quan hệ

```
Nhân viên chọn file ở ô "Bản kỹ thuật gốc" của checklist
        │
        ├─► storage_service.upload_file()  ── ĐÚNG MỘT object, không bao giờ copy
        │      contracts/{contract_id}/dossier-documents/{document_id}/{filename}
        │
        ├─► insert dossier_documents
        │      contract_id, service_line_id, task_node_id,
        │      stage, slot_id, doc_status='DANG_DUNG', revision_no
        │
        ├─► insert dossier_document_links        (tài liệu × Ô GIẤY)
        ├─► insert checklist_result_document_links (tài liệu × CHECKLIST)   ← M1
        │
        └─► evidence_data.files[] chỉ ghi { "document_id": "..." }
               KHÔNG lưu URL. URL do backend sinh lúc đọc.

Nộp checklist  ─► gate dùng chung (bảng ngay dưới)
Giám đốc duyệt ─► tài liệu thành thành phần chính thức, Node sau đọc được
Giám đốc từ chối ─► doc_status='KHONG_HOP_LE'; object GIỮ NGUYÊN;
                    nộp bản mới = dòng mới, supersedes_id trỏ bản cũ
```

### Cổng chặn phía máy chủ

Một hàm dùng chung `checklist_output_blockers(db, checklist_result_id)`, gọi từ **cả**
`_authorized_checklist_for_submission` (chặn thật) **lẫn** API cấp dữ liệu cho frontend
(khoá nút). Một luật, một chỗ — không để UI báo nộp được mà backend chặn.

Một tài liệu chỉ được tính là hợp lệ khi **đủ cả năm**:

| Điều kiện | Vì sao |
|---|---|
| Nối đúng `checklist_result_id` | quan hệ ở bảng M1 |
| Thuộc đúng `contract_id` + `service_line_id` | khoá ngoại ghép lo phần contract; service_line kiểm ở truy vấn |
| `doc_status = 'DANG_DUNG'` | loại `KHONG_HOP_LE` và `DA_THAY_THE` |
| Đã duyệt, nếu `needs_director_approval = true` | bản chờ duyệt chưa phải tài liệu chính thức |
| Số bản `>= min_count` | thiếu thì báo tên ô còn thiếu |

Ba ranh giới cố ý:

1. Checklist **không** có `output_documents` ⇒ hàm trả rỗng ngay, không truy vấn gì.
   Luồng cũ chạy y nguyên.
2. Điều kiện này đặt **sau** kiểm checklist trong `auto_finalize_node_if_ready`, và
   **trước** cổng công nợ K06 — không được chạm nhánh `is_handover`.
3. Node quá hạn vẫn theo luật `late_reason` hiện có. Đủ tài liệu **không** thay cho
   giải trình trễ; hai điều kiện độc lập.

### Object key — theo ID ổn định

```
contracts/{contract_id}/dossier-documents/{document_id}/{filename}
```

Ví dụ thật từ diễn tập:

```
contracts/003_BK-2026/dossier-documents/DOC-1/ban-ky-thuat-goc.pdf
```

**Không** dùng `.../dossier/{stage}/{filename}` như hiện tại. Lý do: `stage`, loại giấy
và slot đều là **metadata trong database** và đều có thể đổi. Nhét chúng vào đường dẫn
nghĩa là mỗi lần đổi phân loại phải di chuyển object — đúng thứ nghiệp vụ cấm. Khoá theo
`document_id` thì tệp nằm yên một chỗ suốt đời.

Đường dẫn cũng không mang tên khách, CCCD hay số điện thoại, và vẫn nằm dưới prefix
`contracts/` nên chạy nguyên vẹn trên R2 production.

`DossierFileReference` sẽ đổi theo. Nó đang được dùng ở 2 chỗ trong `src`
(`register.py:866`, `documents.py:223`) và 4 test; `dossier_documents` hiện **0 dòng**
nên không có object nào phải di dời.

### URL không phải nguồn dữ liệu

`evidence_data.files[]` hiện lưu `{name, url, note}` — URL tạm bị coi như dữ liệu chính.
Từ nay chỉ lưu `document_id`; link xem/tải do backend sinh khi đọc, qua endpoint có kiểm
quyền. URL hết hạn hay đổi provider (MinIO → R2) cũng không làm hỏng dữ liệu cũ.

### Phạm vi áp dụng — điểm cần bạn xác nhận

Luồng hợp nhất này **chỉ áp dụng cho checklist có `output_documents`**. Checklist thường
(ảnh chụp chứng minh đã gọi khách, ảnh chấm công…) giữ nguyên đường minh chứng cũ, không
sinh dòng `dossier_documents`. Đó là cách đọc điểm 7 của bạn — *"không để logic này ảnh
hưởng checklist thường"* — cộng với §I.3: minh chứng và tài liệu đầu ra là hai vai khác
nhau, một tệp **có thể** kiêm cả hai chứ không phải mọi minh chứng đều là tài liệu hồ sơ.
Nếu bạn muốn **mọi** minh chứng đều vào hồ sơ có cấu trúc thì phạm vi rộng hơn hẳn — nói
để tôi làm lại.

---

## 9. Blast radius

| Symbol | GitNexus | grep | Ghi chú |
|---|---:|---:|---|
| `auto_finalize_node_if_ready` | 3 · **LOW** | **5 call site** | GitNexus **bỏ sót `dossiers/handover.py`** (đường K06 công nợ) và lời gọi nội bộ |
| `_authorized_checklist_for_submission` | 3 · LOW | 3 | trên luồng `submit_checklist_evidence` |
| `submit_checklist_evidence` | — | 1 | |
| `_ensure_node_module_records` | — | 7 | **không sửa** |
| `evidence_file_reference` | — | 5 | |

Không có HIGH/CRITICAL.

**Chỗ nguy nhất là `auto_finalize_node_if_ready`**: nó nằm trên đường đóng Node của *mọi* bước, và `handover.py` gọi nó ở nhánh duyệt công nợ K06. Thêm điều kiện sai chỗ là K06 không bao giờ đóng được. Điều kiện tài liệu đầu ra phải đặt **sau** kiểm checklist và **chỉ** kích hoạt khi checklist có `output_documents`.

---

## 10. File dự kiến sửa

**Backend**
- `contracts/workflow_runtime.py` — chuẩn hoá `output_documents` trong validate graph; thêm gate vào `auto_finalize_node_if_ready`
- `employee_portal/service.py` — `checklist_output_blockers`, chặn trong `_authorized_checklist_for_submission`
- `dossiers/documents.py` — hàm nộp tài liệu đầu ra (tái dùng `storage_service`)
- `routes_employee_portal.py` — endpoint upload/gỡ tài liệu đầu ra + trạng thái
- `files/references.py` — thêm `{document_id}` vào `DossierFileReference`

**Frontend**
- `ContractWorkflowDesigner.jsx` — ô "Tạo tài liệu đầu ra", mặc định thu gọn
- `EmployeeItemWorkspace.jsx` + `ChecklistEvidenceItem` — khu nộp tài liệu, khoá nút kèm lý do
- `components/ui/FilePreviewModal.jsx` — **tái dùng**, không viết mới
- CSS module tương ứng

**Không đụng:** `storage_service.py`, `register.py` (phần K01 của agent trước), `_ensure_node_module_records`, cơ chế SSE.

---

## 11. Danh sách test

### Backend (16)

| # | Ca | Chốt điều gì |
|---|---|---|
| 1 | Node không cấu hình tài liệu đầu ra | luồng checklist cũ chạy y nguyên, `checklist_output_blockers` trả rỗng, không truy vấn |
| 2 | Checklist đòi "Bản kỹ thuật gốc" nhưng chưa có tệp | backend chặn 409, thông báo nêu đúng tên ô |
| 3 | Đã đủ tệp, nối đúng slot | nộp thành công |
| 4 | Upload vào sai Hợp đồng | chặn — khoá ngoại ghép, không phải code |
| 5 | Sai Hạng mục (đúng Hợp đồng) | chặn ở tầng truy vấn |
| 6 | **Một tệp hai vai** | đúng **một** lần gọi `upload_file`, **một** `object_key`, hai dòng quan hệ |
| 7 | Node revisit / reopen / rollback | không tạo trùng `survey_records` / `legal_dossiers` — khoá lại cơ chế đã có |
| 8 | Giám đốc duyệt | tài liệu hợp lệ, Node sau đọc được |
| 9 | Giám đốc từ chối | object còn, `KHONG_HOP_LE`, không dùng để đóng checklist được |
| 10 | Nộp bản mới sau khi bị từ chối | dòng mới `revision_no=2` + `supersedes_id`; bản cũ không bị sửa |
| 11 | K02 và K03 | stage khác nhau, K03 không ghi đè K02 |
| 12 | `needs_director_approval=true`, tệp chưa duyệt | chưa tính là đủ |
| 13 | `min_count=2` mới có 1 tệp | chặn |
| 14 | Auto-finalize | chỉ đóng khi checklist đạt **và** đủ tài liệu |
| 15 | **K06 regression** | cổng công nợ không bị điều kiện mới làm kẹt; chạy lại `test_handover_override_gate_unittest.py` |
| 16 | `_validate_graph_payload` | 5 ca ở §7: template không tồn tại, `min_count=0`, boolean sai kiểu, trùng `template_id`, field lạ |

### Frontend (6)

| # | Ca |
|---|---|
| 17 | Bật/tắt "Tạo tài liệu đầu ra" — mặc định thu gọn, chỉ bung khi bật |
| 18 | Dropdown loại tài liệu lấy đúng danh mục của Hạng mục, không cho gõ tự do |
| 19 | Thiếu tài liệu ⇒ nút nộp khoá + hiện đúng lý do lấy từ backend |
| 20 | Ảnh/PDF preview được (tái dùng `FilePreviewModal`) |
| 21 | Word/Excel hiện thông tin tệp + nút tải |
| 22 | Inspector không tràn ngang, không che nút |

---

## 12. Trạng thái duyệt

| Điểm | Trạng thái |
|---|---|
| Giữ nguyên 3 cờ, chỉ thêm test chống trùng | ✅ đã chốt |
| Stage `do-hien-truong` cho K02 | ✅ đã chốt |
| Bảng nối nhiều-nhiều thay cho cột đơn | ✅ đã chốt |
| Cấu hình trong graph theo `template_id` | ✅ đã chốt |
| Một tệp một object, `evidence_data` chỉ giữ `document_id` | ✅ đã chốt |
| Object key `contracts/{c}/dossier-documents/{document_id}/{file}` | ✅ đã chốt |
| Cổng chặn phía máy chủ | ✅ đã chốt |
| Chuẩn hoá `_validate_graph_payload` | ✅ đã chốt |

Hai điểm hỏi ở bản trước đã được trả lời: **giữ `contract_id`**, và **luồng hợp nhất chỉ
áp dụng cho checklist có `output_documents`**.

## 13. Hai việc chặn, cần bạn quyết

### 13.1 · `validate_workflow_graph` là **HIGH risk**

Đây là hàm phải sửa để chuẩn hoá `output_documents` (§7). Impact:

| | |
|---|---|
| Risk | **HIGH** |
| Impacted | 5 |
| Direct caller | `save_workflow_draft`, `create_workflow_template` |
| Luồng ảnh hưởng | `create_workflow_template`, `save_service_line_workflow_draft`, `activate_service_line_workflow` |

Nó là cổng validate của **mọi** lần lưu nháp, tạo mẫu và kích hoạt quy trình. Sửa sai
thì Giám đốc không lưu nổi bất kỳ quy trình nào — kể cả quy trình không dùng tài liệu
đầu ra. Theo AGENTS.md, HIGH phải báo trước khi sửa.

Cách tôi định giảm rủi ro: tách toàn bộ phần mới ra một hàm riêng
`_normalize_output_documents(raw_item, ...)`, gọi từ đúng một chỗ trong vòng lặp
checklist; checklist không khai `output_documents` thì hàm trả `None` và **không thêm
khoá nào vào graph** — quy trình cũ đi qua y hệt hôm nay. Test khoá lại điều đó trước.

*(Đính chính: bản trước tôi gọi hàm này là `_validate_graph_payload` — tên đó không tồn
tại trong mã nguồn.)*

### 13.2 · M0 buộc code và migration phải đi cùng nhau

`contract_id` là **NOT NULL**, mà cả ba lệnh `insert into task_node_checklist_results`
(`workflow_runtime.py` dòng 1149, 1314, 1540) đều chưa ghi cột đó. Nên:

- Apply M0 mà chưa sửa code ⇒ **tạo Node mới sẽ lỗi NOT NULL**.
- Sửa code mà chưa apply M0 ⇒ **lỗi cột không tồn tại**.

Không có cách nào để hai thứ đó độc lập với nhau. Vì dev và live hiện là **cùng một
database**, nhánh này chạy với Supabase sẽ hỏng ở khoảng giữa.

Ba hướng, tôi đề xuất hướng 1:

1. **Ghép chung một lần** *(đề xuất)* — tôi viết code + test xong, bạn duyệt, rồi apply
   M0/M1/M2 và merge code cùng lúc. Khoảng hỏng bằng không.
2. **Tách expand–contract** — M0a thêm cột nullable + backfill, deploy code, M0b mới
   `set not null`. An toàn hơn nhưng thành 4 migration và phải apply live 2 lần.
3. **Hoãn phần INSERT** — tôi làm mọi thứ khác trước, phần này để sau. Nhưng khi đó M0
   chưa apply được, nên M1 cũng chưa, nên gate cũng chưa chạy thật được.

Tôi sẽ viết `contract_id` bằng truy vấn con ngay trong câu INSERT
(`select sl.contract_id from task_nodes … where n.id = :task_node_id`) chứ không truyền
từ Python — như vậy giá trị luôn khớp với backfill và không thể lệch.
