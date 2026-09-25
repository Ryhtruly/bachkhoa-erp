# Contract Template Management Design

**Status:** Revised after review on 2026-09-25; implementation not started.  
**Topic:** Quản lý mẫu hợp đồng (Contract Template Management).  
**Approved recovery decision:** Người dùng chấp thuận version có thể bị khuyết: reserve version trong PostgreSQL trước khi upload, giữ lại lần upload thất bại để retry. Nếu v2 thất bại, một lần nâng cấp mới có thể thành v3.

## 1. Goal and scope

Cho phép Giám đốc / Admin quản lý mẫu DOCX, nâng cấp phiên bản, ban hành/lưu trữ, tải file gốc và tra cứu placeholder. Giữ nguyên file phiên bản cũ, lựa chọn mẫu của hợp đồng lịch sử và đường đọc tài liệu đã phát hành.

In scope:
- Mẫu mới có code/name/description/file, version bắt đầu từ 1; upgrade cùng code dùng max(version) + 1, kể cả pending/failed.
- Lifecycle `draft | published | archived`, độc lập với upload `pending | ready | failed`.
- Retry cùng version bằng đúng nội dung đã reserve; file khác tạo version mới.
- View switcher Director/Admin trong Contracts.jsx, search/filter/history, upload/retry/download và placeholder drawer.
- Migration và kiểm thử PostgreSQL concurrency/recovery, API permissions, create/open contract.

Out of scope: Word editor, dynamic form builder, thêm trường hợp đồng/khách hàng, hard delete, overwrite object cũ, cleanup job, thay đổi renderer/fallback hoặc công cụ bootstrap.

## 2. Data model and storage

### 2.1. Identity and upload metadata

Giữ các cột hiện có trong `contract_templates`, `UNIQUE(code, version)`, FK từ contracts/generated documents và ID/key của dữ liệu cũ. Thêm:

| Cột | Kiểu | Quy tắc |
| --- | --- | --- |
| upload_state | text NOT NULL | pending, ready, failed; reservation mới pending |
| content_sha256 | varchar(64), nullable legacy | Digest bytes đã validate; bất biến sau reservation |
| content_size | bigint, nullable legacy | Bytes; reservation mới 1..20 MiB |
| publish_requested | boolean NOT NULL DEFAULT false | Lưu publish_immediately để retry giữ ý định ban đầu |

Constraints:
- Partial unique index trên code WHERE status = 'published': tối đa một published/code.
- Published bắt buộc ready và storage key không rỗng.
- Pending/failed chỉ có lifecycle draft; không xuất hiện trong creation catalog.
- SHA/size cùng null cho legacy hoặc cùng có giá trị hợp lệ; reservation mới luôn ghi đủ.

Migration preflight dừng nếu duplicate published/code, published thiếu key, hoặc archived thiếu key; báo ID để xử lý, không tự sửa lịch sử. Backfill legacy có key thành ready, draft thiếu key thành failed. Không đổi lifecycle/ID/version/key/bytes. Ready backfill là phân loại theo metadata, không chứng minh object tồn tại. Legacy thiếu digest không retry cùng version; user tạo version mới. Migration chạy trước backend đọc cột mới; test actual migration và ORM constraints trên PostgreSQL.

### 2.2. Private immutable storage

- Key: `contract-templates/{code}/v{version}.docx`; MIME DOCX chuẩn.
- Giữ `_require_prefix` và `upload_contract_template()` với `IfNoneMatch="*"`; không overwrite hoặc check-then-put.
- File tải qua API xác thực; frontend không nhận public URL/storage key.
- Recovery xác minh SHA-256 và size trong **primary configured bucket**, không dùng legacy-bucket fallback hoặc ETag thay digest.
- Không xóa object để chữa lỗi DB commit; reservation giữ liên hệ bền vững giữa object và version.

## 3. Concurrency, upload and lifecycle

### 3.1. Catalog lock

Mọi transaction reserve/finalize/status lấy cùng PostgreSQL transaction-scoped advisory lock `(240925, 1)` trước khi đọc trạng thái/version. Lock toàn catalog vì quy tắc mẫu published cuối cùng áp dụng xuyên code. Dùng READ COMMITTED, re-read sau lock. Không giữ DB transaction/lock trong lúc gọi storage. Partial unique index bổ sung ràng buộc một published/code. Không hứa bảo vệ SQL thủ công bypass service.

### 3.2. Reserve -> upload -> finalize

1. Kiểm quyền, code/name và DOCX trước mọi write.
2. Transaction A: lock, kiểm tra code/parent, cấp version, lưu draft/pending với key/digest/size/publish intent; commit. Chỉ khi reservation commit thành công mới upload.
3. Upload immutable. Nếu conflict, đọc object primary bucket: đúng digest/size thì tiếp tục; khác bytes trả 409; không đọc được/biến mất trả 503. Không overwrite/adopt bytes khác.
4. Transaction B: lock, re-read reservation, đánh dấu ready. Nếu publish_requested và không có version cao hơn đang published cùng code: archive published cũ, flush, publish mới trong cùng transaction. Nếu có version cao hơn: giữ draft, trả publication_skipped=true.
5. Lỗi storage giữ reservation và cập nhật failed nếu DB còn truy cập được, với điều kiện upload_state != ready. Lỗi finalize/commit/crash có thể để pending; vẫn retry được. Không hạ ready về failed do request cạnh tranh.
6. Retry dùng cùng ID, digest, size, metadata và intent. Đã ready thì trả hiện trạng, không re-publish bản archived. Chưa ready thì upload/verify/finalize. Hai retry cùng bytes hội tụ về một version.

Validation failure không tiêu thụ version. Failure sau reservation có thể tiêu thụ version. Response bị mất: UI refresh danh sách rồi cho retry bản pending/failed, không tự POST thêm version.

### 3.3. Publication rules

- Status endpoint chỉ nhận published/archived; draft bị 422.
- Pending/failed không đổi lifecycle; trả 409.
- Publish ready draft/archived: archive published khác cùng code rồi publish target trong một transaction; explicit rollback về version cũ được phép.
- Archive published: đếm published toàn hệ thống dưới catalog lock; count <= 1 trả 400.
- Archive ready draft hoặc archive lại archived không giảm số published.
- Catalog đang có published không được bị management đưa về 0. Catalog hoàn toàn mới có thể chưa published; upload đầu chọn draft vẫn giữ draft.

## 4. Backend API

Cả **bảy** management endpoints dùng `require_permission("contract", "create")` và `src.dossiers.actor_guard.is_director(db, user.id)`. User ORM không có is_director; profile response mới có field này. Admin-role user có username khác admin vẫn được phép. `GET /api/contracts/templates` giữ permission hiện có cho người tạo hợp đồng.

### 4.1. List management

`GET /api/contracts/templates/manage?status=all&q=...`

Status: all/draft/published/archived. Chọn code có ít nhất một version khớp cả hai bộ lọc, sau đó trả **toàn bộ** lịch sử của code đó. latest_version luôn là max thật, không bị filter làm sai.

Group DTO: code, name, latest_version, active_template (published hoặc null), display_template (latest), versions. Group name lấy từ display_template. Version DTO: id, code, version, name, description, template_file_name, status, upload_state, created_at, updated_at, created_by_name, can_retry. can_retry chỉ true khi pending/failed có digest/size. Không trả key/digest hoặc lỗi hạ tầng thô.

### 4.2. Create and upgrade

`POST /api/contracts/templates/upload`: multipart file, code, name, optional description, publish_immediately=true. Trim/uppercase code rồi match `^[A-Z0-9_]{3,50}$`; trim name không rỗng. Code tồn tại kể cả pending/failed trả 409. Thành công 201.

`POST /api/contracts/templates/{id}/versions`: multipart file, optional name/description, publish_immediately=true. Parent là bất kỳ version nào cùng code. Name trống kế thừa parent; description ghi chú version mới. max tính trên tất cả upload/lifecycle states. Thành công 201.

### 4.3. Retry and status

`POST /api/contracts/templates/{id}/retry-upload`: multipart chỉ file. Bytes phải khớp reservation; giữ filename/name/description/version/publish intent. Legacy thiếu digest hoặc bytes khác trả 409. Thành công/idempotent replay 200.

`POST /api/contracts/templates/{id}/status`: JSON status published hoặc archived, dùng Literal và forbid extra fields. Quy tắc mục 3.3; thành công 200.

Mutation response: `{"status":"success","data": <version DTO>,"publication_skipped": false}`. publication_skipped chỉ true khi finalize mới không auto-publish do đã có version cao hơn published.

Errors: 400 invalid DOCX/field hoặc archive-last; 401 unauthenticated; 403 permission/role; 404 ID; 409 duplicate code/mismatched bytes/not-ready; 413 quá size; 415 extension/MIME; 422 invalid schema/status; 503 storage/DB tạm lỗi. Sau reservation, 409/503 có detail object chứa message/template_id/version; không lộ key/credentials. Commit lỗi không chắc chắn phải refresh trạng thái, không tuyên bố reservation đã rollback.

### 4.4. Download

`GET /api/contracts/templates/{id}/download`: chỉ ready có key; pending/failed trả 409. Reader hiện có lấy bytes; trả DOCX MIME và `build_content_disposition_header(filename, disposition="attachment")`, expose Content-Disposition. Storage không đọc được trả 503; không render template khác thay file gốc.

### 4.5. Placeholders

`GET /api/contracts/templates/placeholders`: list `{category, items: [{placeholder, label, example}]}`. Catalog đảm bảo cho feature này là key có ở cả generate_and_save_contract và build_current_contract_document_data:

| Nhóm | Keys (UI có đủ dấu {{...}}) |
| --- | --- |
| Khách hàng | customer_name, phone, customer_phone, address, customer_address, customer_email |
| Hợp đồng | contract_id, service_type, date_signed, due_date, sales_source |
| Giá trị | contract_value, total_amount |

address là địa chỉ dịch vụ khi dựng lại dữ liệu hiện tại; customer_address là địa chỉ khách. Format ngày/tiền giữ renderer hiện có; sales_source có thể rỗng khi rerender legacy. Không quảng bá email, id_card_*, representative_* vì pipeline chưa cấp các key đó. Không thêm trường/đổi renderer. Alias legacy khác vẫn hoạt động nhưng ngoài catalog đảm bảo cho template mới. Placeholder trong header/footer/textbox không được hứa hỗ trợ; renderer hiện thay paragraph/table.

### 4.6. DOCX validation

- Extension .docx case-insensitive; MIME DOCX, application/octet-stream hoặc thiếu MIME nếu package thật hợp lệ. Extension/MIME khác: 415.
- Backend đọc tối đa `20 * 1024 * 1024 + 1` bytes, vượt 20 MiB: 413; client có cùng limit.
- ZIP signature và exact entries `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`.
- Chặn >2048 entries, tổng uncompressed >100 MiB, encrypted entry trước parse.
- Parse bằng python-docx.Document rồi dry-render/save bằng `render_contract_document({}, "mau_hop_dong_v1", template_bytes=bytes)`; OOXML/relationships lỗi trả 400 trước reservation. Không ghi file tạm/public để kiểm tra.

## 5. Frontend

- Dùng isDirector prop hiện có để guard switcher và manager. Quay lại giữ hành vi list/composer; toolbar tạo hợp đồng không xuất hiện nhầm trong view quản trị.
- Search/status all/draft/published/archived; current published tách latest upload, history có action theo từng version ID.
- Pending “Chưa hoàn tất”; failed “Tải lên thất bại”; ready có download/lifecycle actions. can_retry hiện “Thử tải lại cùng tệp”; luôn có tạo version mới để đổi nội dung. Không tự cấp version từ latest_version + 1 trên client.
- FormData qua apiFetch, không tự đặt Content-Type; timeout 60s; khóa submit in-flight. Error/timeout refresh list, giữ lỗi/file và không tự POST version khác.
- downloadFile giữ auth/Blob/filename UTF-8; không dùng link thiếu bearer hoặc apiFetch JSON cho binary.
- publication_skipped có thông báo file đã sẵn sàng nhưng vẫn draft do version mới hơn đang published.
- Placeholder drawer copy/toast; clipboard failure báo lỗi.

## 6. Compatibility and testing

- v1 ID/key/bytes bất biến khi publish v2/v3. Contract cũ vẫn trỏ v1; stored generated document đọc trước; legacy rerender chọn archived v1 theo ID. Không đổi fallback hiện có.
- Creation catalog chỉ published; DB bảo đảm published ready. Test tạo contract chọn version mới và lưu đúng template ID.
- PostgreSQL: actual migration, unique/check constraints, hai connection thật cho concurrent archive/publish/reservation. Không mock lock/count hay dùng SQLite để chứng minh invariant.
- Fault injection sau reservation/storage/finalize; same-file retry, khác bytes 409, version gap, stale finalize, hai retry cùng ID, lost response.
- API matrix cả 7 endpoints: 401; contract:create nhưng non-director 403; username khác admin với active admin role thành công; thiếu permission bị chặn.
- Real DOCX fixtures bằng Document().save; invalid ZIP/relationships/body, oversized, MIME/extension, Unicode filename.
- Chạy renderer/storage/catalog/selection regressions. Browser smoke upload -> download -> upgrade -> create -> open historical, cộng recovery khi storage lỗi. Mocks không thay thế private-storage smoke.

Tasks và lệnh chạy: [implementation plan](../plans/2026-09-25-contract-template-management.md).
