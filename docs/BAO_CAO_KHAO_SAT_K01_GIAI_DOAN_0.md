# BÁO CÁO KHẢO SÁT — GIAI ĐOẠN 0
## Hồ sơ đầu vào Hợp đồng & Node K01

> Trạng thái: **chưa sửa code, chưa apply migration**. Chờ duyệt.
> Nguồn: schema thật qua Supabase MCP, đọc source, impact analysis GitNexus.

---

## 1. Flow thực tế hiện tại

```
[Tạo Hợp đồng]  ContractService.create_contract (contracts/services.py)
    ├─ tạo contracts + service_lines + receivables
    └─ open_contract_register()  → đổ sổ gốc từ document_checklist_templates
                                    (chỉ giấy source='KHACH_HANG', task_type_id is null)

[Kích hoạt quy trình]  activate_workflow (contracts/workflow_runtime.py)
    ├─ tạo task_nodes từ graph revision; start_node → status 'ready', còn lại 'pending'
    ├─ tạo task_node_checklist_results theo graph
    └─ open_service_line_register() + open_contract_register()

[Bể việc]  EmployeePortalService.get_task_pool
    └─ lọc theo task_pool_departments(node_code) — K01 mở cho SALES|LEGAL|SURVEY

[Nhận việc]  claim_and_start_task → task_node_assignments + node 'in_progress'

[Nộp checklist]  routes_employee_portal /tasks/{id}/checklist/{cid}/submit
    ├─ _authorized_checklist_for_submission  (đã có gate K01: sổ gốc còn CHUA_CO → 409)
    └─ file → FileReference → upload_file → contracts/{c}/service-lines/{sl}/nodes/{n}/{file}
                              ghi vào task_node_checklist_results.evidence_data->'files'

[Duyệt checklist]  routes_contracts /workflow/checklist/{id}/review
    └─ auto_finalize_node_if_ready → mọi checklist approved ⇒ tự nộp + nghiệm thu node,
       sinh work_pay_entitlements, mở node kế. (Ngoại lệ: node is_handover không tự đóng.)

[Đọc file]  GET /api/employee-portal/file?object_key=...   (regex chỉ nhận .../nodes/...)
            GET /api/document-register/scans/{id}/download  (đường thứ hai, cho sổ giấy tờ)
```

---

## 2. Bảng/cột hiện có tái sử dụng được

| Khái niệm trong Master Plan | Bảng hiện có | Đủ / Thiếu |
|---|---|---|
| Tài liệu nguồn (Hợp đồng) | `dossier_documents` — object_key, file_name, content_type, size_bytes, contract_id, service_line_id, scope, stage, slot_id, uploaded_by/at | **Thiếu** checksum, revision, supersedes; **buộc** phải có slot_id |
| Reference phân loại (Hạng mục) | `dossier_document_slots` — scope CONTRACT/SERVICE_LINE, source, status, copy_type, needs_original, quantity, template_id, storage_location_id | Gần đủ. Thiếu liên kết tới *file nguồn dùng chung* |
| Checklist template | `document_checklist_templates` (theo `task_types`) | Đủ |
| Checklist K01 + evidence | `task_node_checklist_results` + `evidence_data` jsonb `{files:[...]}` | Đủ |
| Submit / review | `task_node_acceptances` (attempt_no, submission_payload, review_payload, review_note) | Đủ |
| Audit cấp node | `task_node_events` (event_type, from/to_status, actor_user_id, payload jsonb) | Đủ cho node |
| Phiếu xin sửa | `document_slot_change_requests` | Đủ, nhưng **khác nghĩa** với "yêu cầu bổ sung giấy tờ" |
| Manifest revision | — | **Không có** |
| Yêu cầu bổ sung | — | **Không có** |
| Audit toàn cục | `audit_log` (actor_id, action, object_type, payload_json) | **Thiếu `object_id`** |

Storage: `storage_service.py` đã có `upload_file`, `get_file`, `delete_file`, `file_exists`,
`find_file_by_prefix`, `_require_prefix`. Prefix hợp lệ: `wiki/`, `contracts/`, `avatars/`
(+ `finance/`, `contract-templates/` ở bucket riêng khi dev).

---

## 3. Khoảng thiếu — có bằng chứng

### G1. Không có kho tài liệu nguồn đúng nghĩa
`register.attach_scan(slot_id, ...)` **bắt buộc** có `slot_id`. Không có đường upload
file vào Hợp đồng khi **chưa biết nó là giấy gì**. Master Plan §2.2 yêu cầu ngược lại:
upload trước ở form Hợp đồng, **K01 mới phân loại**.

### G2. Object key đóng băng phân loại — lỗi thiết kế cần sửa
Hiện tại: `contracts/{c}/ho-so-goc/{slug-tên-giấy}/{file}`
Master Plan §3.2: `contracts/{c}/source-documents/{document_id}/{file}`

Key hiện tại **gắn với tên loại giấy**. Phân loại lại (hoặc sếp đổi tên mục trong mẫu)
⇒ file nằm sai thư mục, hoặc phải copy object — vi phạm điều cấm "không nhân bản file".
Đây là lỗi tôi đưa vào ở vòng trước, phải sửa trước khi có dữ liệu thật.

### G3. Không có checksum → không nhận diện upload trùng (Master Plan §6.3)

### G4. Không có revision/supersedes cho file thay thế (§2.3, §6.2)

### G5. Không có manifest (§2.3, §5.1)
Không bảng nào lưu snapshot bộ hồ sơ đã ban hành. `K01_CAN_COMPLETE` hiện **không**
kiểm manifest — auto_finalize chỉ xét checklist.

### G6. `audit_log` không có `object_id`
Chỉ `object_type` + `payload_json` (text). Không truy được "ai sửa ô giấy nào".
Không đạt yêu cầu §9 "mọi upload/thay thế/phân loại/submit/reject/approve đều có audit".

### G7. RLS bật nhưng **0 policy**
`task_nodes`, `workflow_instances`, `task_node_checklist_results`: `relrowsecurity = true`,
`pg_policies` = 0 ⇒ **deny-all** với mọi role không phải owner. Backend chạy bằng owner nên
chưa lộ. Nếu sau này dùng Supabase anon/authenticated key, ba bảng này biến mất.

### G8. Không có URL ký có thời hạn
`get_file_url()` **raise** khi `managed` (R2) và trả public URL khi dev. Mọi đọc file đi
qua endpoint backend kiểm quyền — đúng tinh thần private, nhưng **chưa** đáp ứng quy tắc
đã chốt "URL tải/preview phải tạo động, có thời hạn".

### G9. `get_file` bị định nghĩa hai lần
`storage_service.py:172` (trả `bytes`, **không** kiểm prefix) và `:184` (trả `dict`, có
kiểm prefix). Python lấy bản sau ⇒ bản đầu là code chết. Bug thật, dễ gây hiểu nhầm khi đọc.

### G10. Hai đường đọc file song song
`/api/employee-portal/file` regex **chỉ** nhận `contracts/{c}/service-lines/{sl}/nodes/{n}/{f}`
nên file sổ gốc không đọc được qua đó → tôi đã thêm `/api/document-register/scans/{id}/download`.
Hai đường đọc cho cùng một kho là mầm lệch quyền.

### G11. Không có ràng buộc DB chống tham chiếu chéo Hợp đồng
Chỉ chặn ở code. Chưa có FK/CHECK bảo đảm `slot.contract_id = document.contract_id`.

---

## 4. Blast radius (GitNexus, epistemic="exact")

| Symbol | Risk | Caller trực tiếp | Process ảnh hưởng |
|---|---|---|---|
| `submit_task_node_for_acceptance` | LOW | 1 (`submit_task`) | 1 |
| `auto_finalize_node_if_ready` | LOW | 3 | 2 (`review_checklist_evidence`, `update_legal_submission`) |

Chưa chạy impact cho `attach_scan`, `_authorized_checklist_for_submission`,
`open_contract_register` — **symbol mới thêm trong phiên này, index GitNexus chưa có**.
Cần `node .gitnexus/run.cjs analyze` trước khi sửa chúng.

---

## 5. Endpoint / file sẽ bị ảnh hưởng

Backend
- `src/services/storage_service.py` — gộp `get_file` trùng; (tuỳ chọn) thêm presigned URL
- `src/files/references.py` — thêm `SourceDocumentReference` theo `document_id`
- `src/dossiers/register.py` — tách upload khỏi slot; thêm link/unlink reference
- `src/routes/routes_document_register.py` — endpoint upload theo Hợp đồng, link, manifest
- `src/contracts/workflow_runtime.py` — `auto_finalize_node_if_ready` thêm điều kiện manifest
- `src/employee_portal/service.py` — `_authorized_checklist_for_submission`

Frontend
- `features/document-register/DocumentRegister.jsx`
- `features/employee-portal/EmployeeItemWorkspace.jsx` (workspace K01 hai vùng)
- `pages/Contracts.jsx` (khối "Giấy tờ khách cung cấp" khi tạo HĐ)
- `features/approvals/ApprovalQueue.jsx` (màn duyệt Giám đốc)

---

## 6. Hai phương án schema

### Phương án A — Tối thiểu (mở rộng bảng sẵn có)

```sql
-- dossier_documents thành kho nguồn: nới slot_id, thêm nhận dạng bản
alter table dossier_documents
  add column checksum_sha256 varchar,
  add column revision_no integer not null default 1,
  add column supersedes_id varchar references dossier_documents(id),
  add column doc_status varchar not null default 'UPLOADED';
-- slot_id đã nullable sẵn ⇒ upload trước, phân loại sau

-- Bảng nối nhiều-nhiều: một file nguồn dùng cho nhiều Hạng mục
create table dossier_document_links (
  id varchar primary key,
  document_id varchar not null references dossier_documents(id),
  slot_id varchar not null references dossier_document_slots(id),
  contract_id varchar not null references contracts(id),
  linked_by varchar, linked_at timestamptz default now(),
  unique (document_id, slot_id)
);

-- Manifest
create table service_line_document_manifests (
  id varchar primary key,
  service_line_id varchar not null references service_lines(id),
  revision_no integer not null,
  status varchar not null default 'draft',
  snapshot jsonb not null,
  object_key text,
  published_by varchar, published_at timestamptz,
  supersedes_id varchar references service_line_document_manifests(id),
  unique (service_line_id, revision_no)
);

-- Yêu cầu bổ sung
create table document_supplement_requests (...);

-- audit_log: thêm object_id
alter table audit_log add column object_id varchar;
```

**Đổi:** 3 bảng mới + 5 cột. Giữ nguyên `dossier_document_slots` làm "cấu trúc hồ sơ".
**Được:** khớp Master Plan, không đập bỏ thứ đang chạy.
**Mất:** `dossier_documents` mang hai vai (kho nguồn + tệp minh chứng theo stage).

### Phương án B — Kiến trúc chuẩn lâu dài

Tách hẳn `contract_source_documents` (kho nguồn) khỏi `dossier_documents` (tệp gắn bước),
thêm `document_versions`, gộp mọi audit vào `domain_events` có `entity_type/entity_id`.

**Được:** mỗi bảng một vai, đúng sách vở.
**Mất:** 6+ bảng mới, phải viết migration chuyển dữ liệu và sửa nhiều đường đọc file.
Hiện **chưa có dữ liệu thật** nên chi phí thấp hơn bình thường, nhưng vẫn là gấp ~3 lần A.

### Khuyến nghị: **Phương án A**

Lý do: `dossier_document_slots` đã đúng vai "reference phân loại"; `dossier_documents` chỉ
thiếu vài cột để thành kho nguồn. Master Plan §6.2 nói rõ *"không mặc định phải tạo bảng
mới nếu schema hiện tại đã thể hiện được"*. B chỉ đáng làm nếu sau này kho nguồn phục vụ
cả những thứ ngoài hợp đồng.

**Kèm điều kiện bắt buộc của A:** phải sửa G2 (object key theo `document_id`) **trước**
khi có dữ liệu thật, nếu không sẽ phải di chuyển object sau này.

---

## 7. Migration dự kiến (CHƯA apply)

1. `..._source_document_columns.sql` — checksum, revision_no, supersedes_id, doc_status
2. `..._dossier_document_links.sql` — bảng nối + unique(document_id, slot_id)
3. `..._service_line_manifests.sql` — manifest + unique(service_line_id, revision_no)
4. `..._document_supplement_requests.sql`
5. `..._audit_log_object_id.sql`
6. `..._document_cross_contract_guard.sql` — CHECK/trigger chặn link chéo Hợp đồng

---

## 8. Test case phải viết

| # | Test | Nguồn yêu cầu |
|---|---|---|
| 1 | 10 Hợp đồng ⇒ 10 vùng object key độc lập | §11 |
| 2 | 1 HĐ nhiều Hạng mục, mỗi Hạng mục có K01 + manifest riêng | §2.1 |
| 3 | 1 file nguồn được 2 Hạng mục cùng HĐ tham chiếu, **1 object** | §2.1 |
| 4 | Không tạo được link chéo Hợp đồng (chặn ở DB) | §2.1 |
| 5 | Không có quyền ⇒ không xem/tải được file | §9 |
| 6 | Thay file ⇒ revision mới, bản cũ vẫn đọc được | §2.3 |
| 7 | Giấy thiếu ⇒ tạo được yêu cầu bổ sung | §5 |
| 8 | Từ chối 1 checklist ⇒ K01 không hoàn thành | §5.1 |
| 9 | K01 chỉ mở node kế khi mọi checklist bắt buộc approved | §5.1 |
| 10 | Retry publish ⇒ không tạo manifest/node trùng | §7.3 |
| 11 | Upload OK nhưng DB lỗi ⇒ object không mồ côi | §7.3 |
| 12 | Object key không chứa PII | §9 |
| 13 | Audit truy được actor + thời điểm cho mọi thao tác | §9 |

---

## 9. Việc cần làm ngay, không phụ thuộc duyệt schema

Ba lỗi độc lập, sửa được mà không đụng schema:

1. **G9** — gộp `get_file` trùng trong `storage_service.py`
2. **G2** — đổi object key sổ gốc sang `source-documents/{document_id}/`
   (**làm trước khi có dữ liệu thật**)
3. **G7** — quyết định: bật policy cho 3 bảng RLS, hay tắt RLS cho nhất quán

---

## 10. Câu hỏi cần chốt trước Giai đoạn 1

1. Duyệt **Phương án A** hay B?
2. G7 — RLS: viết policy hay tắt?
3. G8 — có cần presigned URL thật không, hay giữ nguyên đọc qua endpoint backend
   (hiện đã kiểm quyền, và **không** lộ endpoint storage ra client)?
4. `document_slot_change_requests` (xin sửa) và `document_supplement_requests`
   (xin khách bổ sung) — gộp một bảng hay tách hai?
