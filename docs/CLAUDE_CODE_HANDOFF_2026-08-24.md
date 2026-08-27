# Bàn giao cho Claude Code — Bách Khoa ERP

> Ngày chốt: 24/08/2026 (Asia/Ho_Chi_Minh)  
> Nhánh hiện tại: `feature/employee-portal-ui`  
> Mục tiêu: giúp phiên Claude/Opus tiếp theo tiếp tục đúng nghiệp vụ, không làm lại, không phá dữ liệu và không tin nhầm tài liệu cũ.

---

## 0. Đọc phần này trước khi làm bất cứ việc gì

Workspace hiện **rất bẩn** và chứa thay đổi của nhiều phiên/agent. Không được dùng
`git reset --hard`, `git checkout --`, `git clean`, xóa migration hoặc tự ý hoàn tác file
chỉ vì không biết ai tạo ra.

Quy tắc làm việc bắt buộc:

1. Đọc `AGENTS.md` và file này trước.
2. Dùng codebase-memory/GitNexus để tìm luồng code. Trước khi sửa symbol phải chạy
   impact upstream theo quy định dự án; GitNexus có điểm mù với lời gọi
   `module.function()`, vì vậy phải đối chiếu thêm tìm kiếm literal.
3. Nếu impact là `HIGH`/`CRITICAL`, báo người dùng trước khi sửa.
4. Viết test tái hiện lỗi trước hoặc cùng lượt với sửa lỗi.
5. Patch nhỏ, giữ design system/component hiện có; không đập giao diện làm lại.
6. Không thay schema/live DB nếu người dùng chưa duyệt rõ. Kiểm tra schema thật qua
   Supabase MCP trước, không đoán từ migration.
7. Không xóa data, không apply rollback, không sửa RLS/GRANT tùy tiện.
8. Trước khi kết luận hoàn tất phải chạy test phù hợp và `detect_changes`.
9. Cập nhật tiến độ ngắn cho người dùng trong lúc làm; không im lặng quá lâu.

### Thứ tự nguồn sự thật

Khi tài liệu mâu thuẫn, ưu tiên theo thứ tự:

1. Quyết định nghiệp vụ đã chốt trong file bàn giao này.
2. Schema/live data đã đọc bằng Supabase MCP.
3. Code và test hiện tại.
4. `docs/KE_HOACH_THI_CONG_K01.md` và
   `docs/KE_HOACH_MIGRATION_GIAI_DOAN_1.md`.
5. Các master plan cũ/wireframe chỉ dùng tham khảo.

Lưu ý đặc biệt: nhiều tài liệu cũ dùng K08/K09. Hệ thống hiện đã chuyển về chuỗi
K01–K07; bước bàn giao hiện là K06, lưu trữ/đóng hồ sơ là K07. Trong code nghiệp vụ,
ưu tiên cờ trong graph như `is_handover`, `requires_gov_submission` thay vì hard-code
mã K nếu có thể.

---

## 1. Mô hình nghiệp vụ đã chốt

### 1.1 Hợp đồng, Hạng mục và Quy trình

- Một Hợp đồng có nhiều Hạng mục (`service_lines`).
- Mỗi Hạng mục là một dịch vụ khách mua và có **một workflow instance riêng**.
- `projects_tasks` là mô hình vận hành cũ, không còn là trung tâm của workflow mới.
- Workflow chạy thật phải neo vào `workflow_instances`, `task_nodes`, checklist,
  assignment và revision/snapshot.
- Mẫu workflow đã publish không sửa đè. Muốn đổi tạo draft/revision rồi áp dụng.
- Hạng mục đang chạy giữ lịch sử revision cũ; không được đổi âm thầm theo mẫu mới.

### 1.2 Deadline Node và Checklist

- Deadline chỉ tồn tại ở Node: `duration_days`, `duration_hours`, `duration_minutes`,
  từ đó tính `deadline_at` khi Node bắt đầu.
- Checklist **không có ngày bắt đầu/kết thúc riêng** và dùng chung deadline của Node.
- Nếu nộp checklist sau `node.deadline_at`, phải có lý do trễ.
- Trạng thái checklist chuẩn đang hướng tới:
  `NOT_STARTED`, `PENDING_APPROVAL`, `LATE_PENDING_APPROVAL`, `APPROVED`,
  `LATE_APPROVED`, `REJECTED` (DB/code có thể lưu lowercase; UI dịch sang tiếng Việt).
- Node chỉ đạt khi toàn bộ checklist bắt buộc đã được duyệt đạt hoặc duyệt trễ.
- Duyệt hết checklist thì Node tự hoàn tất, trừ khi có nhánh outcome cần người chọn
  hoặc có cổng nghiệp vụ riêng (nộp cơ quan, công nợ bàn giao).

### 1.3 Bể việc và quyền sở hữu chuỗi

Quyết định mới nhất của người dùng:

- Giám đốc thiết kế phòng ban/vai trò/SLA, không gán cứng tên người từ đầu.
- Node `READY` vào Bể việc đúng phòng ban.
- Nhân viên bấm **Nhận trọn chuỗi/Hạng mục** là nhận phần chuỗi Node thuộc phòng mình,
  không chỉ nhận một thẻ Node hiện tại.
- Ví dụ người đo nhận từ K01 thì các Node K02/K03 cùng phòng phải được giữ trước cho
  người đó. Sau khi K01 được duyệt, K02 không được bắn ngược lại Bể việc chung.
- Node tương lai chỉ được reserve/assign; chưa tự chuyển `in_progress` trước khi tới lượt.
- Người phụ/hỗ trợ có thể nhận slot `ASSISTANT` hoặc yêu cầu hỗ trợ khi chủ chuỗi chưa
  tới Node đó. Không được cướp vai trò `MAIN` của chủ chuỗi.
- Claim phải chống tranh chấp bằng Redis distributed lock + atomic SQL; thành công phải
  invalidate cache Bể việc và phát SSE. Không dùng polling `setInterval`.
- WIP/CAD limit và các luật ưu tiên phải giữ nguyên theo master plan hiện tại.

Code đã thấy:

- `dev/backend/src/contracts/workflow_runtime.py`
  - `claim_and_start_task`
  - `_reserve_main_workflow_chain`
  - `_bundle_claim_cad_followup`
  - `task_pool_department_code`, `task_pool_roles`
- `dev/backend/src/employee_portal/service.py`
  - `get_task_pool`, `get_pool_item_detail`
- Test quan trọng:
  - `dev/backend/tests/test_be_viec_chuoi_k_unittest.py`
  - `dev/backend/tests/test_task_pool_runtime_unittest.py`
  - `dev/backend/tests/test_task_pool_routes_unittest.py`
  - `dev/backend/tests/test_nhuong_viec_unittest.py`

Phần này đã có code và test đơn vị, nhưng cần chạy lại integration sau mọi sửa workflow.

### 1.4 K01 — kho tài liệu nguồn và phân loại giấy tờ

Luồng đúng:

1. Người tạo Hợp đồng có thể là **Sales hoặc Giám đốc**.
2. Khi tạo Hợp đồng, họ tải toàn bộ ảnh/PDF/Office khách gửi từ Zalo vào kho nguồn.
   Lúc này chưa cần biết đó là giấy gì.
3. Nhân viên nhận K01 xem kho file thô ở phía trên và danh sách loại giấy tờ cần có
   của đúng Hạng mục ở phía dưới.
4. Nhân viên gán một file nguồn vào một hay nhiều ô giấy. Gán chỉ tạo link DB, không
   copy object.
5. Sau phân loại, màn Hợp đồng hiển thị cấu trúc hồ sơ đã phân loại ở chế độ chỉ xem.
6. Ô bắt buộc đủ file thì K01 mới được nộp. File chưa phân loại chỉ là cảnh báo vì có
   thể thuộc Hạng mục khác, không phải blocker.
7. Giám đốc duyệt hết checklist K01 thì K01 đóng và mở Node tiếp theo.

Ba bảng, ba vai trò:

- `dossier_documents`: tệp nguồn duy nhất.
- `dossier_document_links`: quan hệ phân loại tệp ↔ ô giấy.
- `dossier_document_slots`: yêu cầu loại giấy của Hợp đồng/Hạng mục.

Object key S3-compatible phải ổn định theo ID, không theo tên phân loại:

```text
bucket/
└── contracts/
    └── {contract_id}/
        └── source-documents/
            └── {document_id}/
                └── {original_filename}
```

Dev dùng MinIO, production dùng Cloudflare R2 qua cùng storage abstraction. Không viết
module upload mới; tái sử dụng `dev/backend/src/services/storage_service.py`.

`Nơi lưu` trên UI là vị trí **bản giấy vật lý** (tủ hồ sơ, két sắt, nhân viên đang giữ,
cơ quan đang giữ, đã trả khách), không phải folder/bucket object storage.

Nguồn sự thật K01 phải theo từng `service_line`, không chỉ theo contract:

```text
GET /api/document-register/service-lines/{service_line_id}/k01-status
```

Bộ bắt buộc của Hạng mục gồm:

- ô dùng chung `scope = CONTRACT`, `source = KHACH_HANG`; và
- ô riêng đúng `service_line_id`, `scope = SERVICE_LINE`, `source = KHACH_HANG`.

`k01_blockers(db, service_line_id)` phải là hàm dùng chung cho API hiển thị và cổng nộp,
tránh UI báo nộp được nhưng backend lại chặn.

Endpoint hiện đã có trong code:

- `POST /api/document-register/contracts/{contract_id}/source-documents`
- `GET /api/document-register/contracts/{contract_id}/source-documents`
- `POST /api/document-register/slots/{slot_id}/links`
- `DELETE /api/document-register/slots/{slot_id}/links/{document_id}`
- `GET /api/document-register/service-lines/{service_line_id}/k01-status`

File cần đọc trước khi sửa K01:

- `docs/KE_HOACH_THI_CONG_K01.md`
- `dev/backend/src/dossiers/register.py`
- `dev/backend/src/dossiers/documents.py`
- `dev/backend/src/files/references.py`
- `dev/backend/src/routes/routes_document_register.py`
- `dev/backend/src/employee_portal/service.py`
- `dev/frontend/src/features/document-register/DocumentRegister.jsx`
- `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- `dev/frontend/src/features/contracts/ContractComposer.jsx`
- `dev/frontend/src/components/ui/FilePreviewModal.jsx`
- `dev/backend/tests/test_dossier_documents_unittest.py`
- `dev/frontend/src/features/document-register/DocumentRegister.test.jsx`

UI đã chốt:

- Kho file thô ở trên, hồ sơ đã phân loại ở dưới.
- Form tạo Hợp đồng hỗ trợ số lượng file bất kỳ, danh sách dọc/accordion, không giới
  hạn 3 file.
- Click tên file mở preview: ảnh/PDF xem trực tiếp; Word/Excel hiện thông tin và nút
  tải/mở.
- Màn Hợp đồng chỉ xem; K01 mới có quyền gán/gỡ.
- Không để bảng tràn ngang. Trạng thái thu gọn chỉ nên có tên giấy + link/preview;
  metadata mở qua `Chi tiết`.

### 1.5 K06 — Bàn giao và công nợ

K06 là bước bàn giao hiện tại. Luật cuối cùng:

1. Nếu Hợp đồng còn nợ và chưa được duyệt ngoại lệ, backend khóa checklist/minh chứng
   bàn giao.
2. Nhân viên gửi yêu cầu bàn giao khi còn nợ; Giám đốc duyệt hoặc từ chối.
3. Duyệt ngoại lệ chỉ mở cổng làm checklist. Nó **không biến công nợ thành đã thu đủ**.
4. Khi tất cả checklist K06 được duyệt và cổng công nợ mở (thu đủ hoặc được duyệt nợ),
   Node tự nộp + tự nghiệm thu; không có thêm nút/vòng `Chờ nghiệm thu` chung.
5. Nếu được bàn giao khi còn nợ, Hợp đồng vẫn nằm trong màn kế toán với viền đỏ cảnh
   báo cho đến khi phiếu thu được duyệt và `remaining <= 0.009`.
6. Chỉ tiền thật đã thu đủ mới làm trạng thái tài chính xanh và cho chốt Hợp đồng đầy đủ.

Code trung tâm:

- `dev/backend/src/dossiers/handover.py`
  - `debt_summary`, `create_debt_request`, `review_debt_request`
- `dev/backend/src/contracts/workflow_runtime.py`
  - `_workflow_handover_gate_open`
  - `auto_finalize_node_if_ready`
  - `auto_finalize_contract_handover_nodes`
- `dev/backend/src/finance/services.py`
  - sau khi duyệt phiếu thu gọi thử auto-finalize K06 rồi mới chốt contract
- `dev/frontend/src/features/handover/HandoverPanel.jsx`
- `dev/frontend/src/pages/DebtCollection.jsx`
- `dev/frontend/src/pages/debtCollection.css`
- `dev/frontend/src/pages/Contracts.jsx`
- `dev/frontend/src/components/contracts/contracts.css`

UI/accounting đã có hai lớp cảnh báo đỏ:

- Card Thu Chi Công Nợ: `.debt__card.is-override-alert`.
- Dòng Hợp đồng còn nợ: `.contract-debt-row`, viền đỏ `#ef4444` chạy nhẹ; có fallback
  `prefers-reduced-motion`.

Test quan trọng:

- `dev/backend/tests/test_handover_override_gate_unittest.py`
- `dev/frontend/src/features/handover/HandoverPanel.test.jsx`
- `dev/frontend/src/pages/DebtCollection.test.jsx`
- `dev/frontend/src/pages/Contracts.test.jsx`

---

## 2. Database: cái gì đã apply và cái gì chưa

Supabase project hiện dùng:

```text
project_ref = ejklrwydjplwzztfuygj
```

Hiện chỉ có một project, chưa có staging tách riêng. Vì vậy không được gọi database đó
là “dev an toàn” rồi apply tùy ý.

### Đã apply live — Nhóm A

Ba migration sau đã apply và có rollback tương ứng:

- `20260824110000_source_document_columns.sql`
- `20260824111000_dossier_document_links.sql`
- `20260824112000_audit_log_object_id.sql`

Kết quả đã được đối soát tại thời điểm apply:

- thêm cột checksum/revision/supersedes/doc status cho `dossier_documents`;
- tạo `dossier_document_links` với unique cặp và composite FK chặn nối chéo Hợp đồng;
- thêm `audit_log.object_id`;
- dữ liệu nghiệp vụ không bị thay đổi;
- thử nối hợp lệ, nối trùng, nối chéo, khai gian contract và xóa slot còn link đều cho
  kết quả đúng.

`remove_slot` đã được sửa để kiểm cả tệp gắn trực tiếp và active link trước khi xóa.

### Chưa apply — Nhóm B

- Manifest/snapshot hồ sơ Hạng mục.
- Yêu cầu khách bổ sung giấy.

Quyết định đã chốt cho version tài liệu:

- Hạng mục đang dùng bản cũ **không tự đổi** khi kho nguồn có revision mới.
- UI báo `Có bản mới hơn`.
- Người có quyền đổi thủ công từng Hạng mục.
- Nếu manifest đã publish, đổi tài liệu phải tạo revision manifest mới và ghi audit,
  không sửa đè lịch sử.

Đọc `docs/KE_HOACH_MIGRATION_GIAI_DOAN_1.md` trước khi làm Nhóm B.

### RLS/GRANT — không được xử lý kiểu “bật cho đủ”

Khảo sát trước đó thấy 16 bảng bật RLS nhưng không có policy. Đồng thời anon và
authenticated chưa có GRANT trên 71 bảng public, nên PostgREST hiện bị chặn từ privilege
trước khi tới RLS; backend đang dùng role có quyền cao hơn.

Rủi ro hai chiều:

- cấp GRANT bừa có thể làm lộ các bảng đang tắt RLS;
- đổi backend sang role không bypass có thể khiến bảng RLS 0 policy biến thành deny-all.

Không thay RLS/GRANT nếu chưa có ma trận quyền và kế hoạch production riêng. Tham khảo
`docs/RLS_PRE_PRODUCTION_CHECKLIST.md`.

---

## 3. Những thay đổi gần nhất đã kiểm chứng

### Frontend

Đã kiểm chứng ở lượt gần nhất:

- Inspector workflow: `Chờ duyệt` là footer dưới cùng, không nhảy lên khi đổi tab.
- Dropup duyệt nhanh hiển thị link minh chứng và nút `Từ chối`/`Duyệt đạt`.
- K06 không còn nút `Nộp nghiệm thu`/badge `Chờ nghiệm thu` chung.
- Card công nợ ngoại lệ có viền đỏ; khi đã thu đủ thì không còn cảnh báo đỏ.
- Dòng Hợp đồng còn nợ có viền đỏ động.
- Contract source file dùng danh sách dọc; UI tài liệu được hướng tới không tràn ngang.

Kết quả đã chạy ở lượt gần nhất:

```text
Frontend focused: 21/21 passed
Frontend full:    27 test files / 89 tests passed
Vite build:       thành công
```

Build chỉ còn cảnh báo chunk lớn đã có sẵn.

### Backend

Đã kiểm chứng trực tiếp:

```text
test_handover_override_gate_unittest.py: 12/12 passed
Python py_compile các file backend vừa sửa: thành công
```

Full backend pytest **chưa chạy được** trong lượt cuối vì `TEST_DATABASE_URL` chưa được
cấu hình. Không được báo “backend full pass” dựa trên kết quả targeted.

Kết quả full gần nhất từ giai đoạn migration Nhóm A:

```text
237 passed / 11 failed / 3 collection errors
```

11 lỗi được ghi nhận là bộ lỗi có sẵn ở các nhóm contract/permission/status survey;
phải chạy lại để xác nhận hiện trạng mới, không mặc định chúng vẫn y nguyên.

### Bẫy Docker test

Backend container mount `/app/src` và `/app/static`, nhưng không mount tests. Test trong
`/app/tests` có thể là bản nướng cũ trong image. Trước khi chạy một file test mới, copy
file hiện tại vào container:

```bash
docker cp dev/backend/tests/test_handover_override_gate_unittest.py \
  bachkhoa-erp-dev-backend-1:/app/tests/test_handover_override_gate_unittest.py

docker compose -f docker-compose.dev.yml exec -T -e PYTHONPATH=/app backend \
  python /app/tests/test_handover_override_gate_unittest.py
```

Với full pytest, cần `TEST_DATABASE_URL` trỏ vào database test thật; `conftest.py` cố ý
chặn nếu thiếu để tránh chạy test phá nhầm DB.

---

## 4. Worktree hiện tại và cách bảo toàn

Tại thời điểm bàn giao, `git diff --stat` của tracked files khoảng:

```text
51 files changed, 8350 insertions(+), 1445 deletions(-)
```

Ngoài ra còn nhiều file untracked gồm:

- backend document register, test task-pool/chain/handover;
- frontend employee workspace, document register, approval queue, file preview;
- migration/rollback ngày 24/08;
- nhiều tài liệu Markdown;
- prototype `.dc.html`, HTML mockup và log `.playwright-mcp`.

Không được `git add -A` hoặc commit toàn bộ một cách mù quáng. Trước commit:

1. `git status --short`
2. xem diff theo đúng nhóm file của task;
3. chạy test;
4. chạy `detect_changes({scope: "compare", base_ref: "main"})` hoặc CLI tương đương;
5. stage có chọn lọc;
6. loại prototype/log khỏi commit nếu không phải deliverable.

Không khẳng định mọi file bẩn là của Codex; có thay đổi của người dùng và nhiều phiên
Claude/Codex trước đó.

---

## 5. Việc còn phải làm theo thứ tự ưu tiên

### P0 — Khóa regression nghiệp vụ vừa sửa

- [ ] Chạy lại test chuỗi nhận việc: K01 reserve K02/K03, K02 không quay về pool.
- [ ] Chạy test assistant/help: chỉ nhận phụ hoặc việc được nhờ, không cướp MAIN.
- [ ] Chạy K01 backend + frontend tests trên source hiện tại.
- [ ] Chạy K06 handover/debt tests sau mọi thay đổi finance/workflow.
- [ ] Test thủ công bằng hai tài khoản: Giám đốc và Nguyễn Văn A.
- [ ] Xác nhận SSE cập nhật workspace, không cần reload và không có polling.

### P1 — Hoàn thiện K01 end-to-end

- [ ] Tạo Hợp đồng bằng Sales và bằng Giám đốc đều upload được nhiều file nguồn.
- [ ] File được lưu dưới key `{contract_id}/source-documents/{document_id}/...`.
- [ ] K01 hiển thị kho thô phía trên, slot đúng service line phía dưới.
- [ ] Một file gán nhiều slot không tạo object mới.
- [ ] `unclassified > 0` nhưng đủ slot bắt buộc vẫn cho nộp.
- [ ] slot bắt buộc thiếu/bản đã supersede thì chặn bằng cùng `k01_blockers`.
- [ ] màn Hợp đồng chỉ xem, preview được ảnh/PDF, Office tải/mở được.
- [ ] responsive không có cuộn ngang; row thu gọn chỉ hiện thông tin thiết yếu.

### P2 — Kiểm tra đóng Node và kế toán

- [ ] Duyệt checklist thường tự đóng Node và mở Node sau.
- [ ] Node nhiều outcome dừng để Giám đốc chọn nhánh, không tự đoán.
- [ ] Node nộp cơ quan chờ biên nhận + kết quả cơ quan + đóng hồ sơ.
- [ ] K06 còn nợ chưa duyệt: server chặn upload/submit.
- [ ] K06 duyệt ngoại lệ: làm checklist được nhưng accounting vẫn đỏ.
- [ ] K06 checklist đủ + gate mở: tự hoàn tất, không vòng nghiệm thu thứ hai.
- [ ] Thu đủ tiền thật: accounting xanh, thử auto-finalize K06 rồi chốt contract.

### P3 — Sau khi P0–P2 ổn mới bàn Nhóm B

- [ ] Manifest immutable theo service line/revision.
- [ ] Yêu cầu khách bổ sung giấy tách khỏi yêu cầu sửa nội bộ hiện có.
- [ ] Không dùng trigger nếu composite FK hiện đã chặn nối chéo đủ.
- [ ] Chỉ apply migration sau khi review SQL, down migration, diễn tập và người dùng duyệt.

---

## 6. Những điều Claude/Opus tuyệt đối không nên tự suy luận

- Không coi “Admin” là vai trò nghiệp vụ tách khỏi Giám đốc; hiện admin chính là Giám đốc.
- Không bắt buộc chỉ Sales được tạo Hợp đồng; Giám đốc cũng tạo được.
- Không biến file chưa phân loại thành blocker K01.
- Không phân loại vật lý bằng đường dẫn object storage.
- Không đổi tên folder object khi đổi loại giấy; classification là link DB.
- Không nhân bản file khi một giấy dùng cho nhiều Hạng mục.
- Không auto-upgrade tài liệu cho mọi Hạng mục.
- Không đưa Node đã có MAIN owner trở lại Bể việc sau khi duyệt Node trước.
- Không thêm vòng `Chờ nghiệm thu` sau khi checklist đã được duyệt hết.
- Không coi duyệt nợ ngoại lệ là đã thu tiền.
- Không hard-code K08/K09 từ tài liệu cũ vào code mới.
- Không tạo avatar giả; chỉ dùng ảnh thật hoặc placeholder trung tính.
- Không thêm chữ giải thích li ti, bảng tràn ngang hoặc component nút mới nếu hệ thống đã
  có component tương ứng.
- Không sửa schema chỉ để chữa một lỗi frontend/backend khi schema hiện có đã đủ.

---

## 7. Cách Claude/Opus nên bắt đầu phiên tiếp theo

1. Đọc file này, `AGENTS.md`, rồi đúng tài liệu của module đang được giao.
2. Chạy `git status --short`; ghi nhận file người khác đang sửa.
3. Dùng graph tìm symbol/flow; chạy impact cho từng symbol định sửa.
4. Đọc test hiện có trước khi đọc cả file lớn.
5. Báo người dùng ngắn gọn:
   - hiện trạng tìm được;
   - nguyên nhân;
   - phạm vi file/symbol;
   - test sẽ dùng.
6. Viết test fail, sửa tối thiểu, chạy focused test.
7. Chạy regression module, build nếu là frontend.
8. Chạy `detect_changes`, báo chính xác cái gì đã làm và cái gì chưa kiểm chứng.

### Prompt tiếp tục gợi ý cho Claude Code

```text
Hãy tiếp tục dự án Bách Khoa ERP từ tài liệu bàn giao:
docs/CLAUDE_CODE_HANDOFF_2026-08-24.md

Đọc toàn bộ file đó và AGENTS.md trước khi hành động. Worktree đang rất bẩn và chứa
thay đổi của nhiều agent: tuyệt đối không reset/clean/revert file ngoài phạm vi.

Trước khi sửa symbol, dùng codebase-memory/GitNexus để tìm flow và chạy impact upstream;
đối chiếu grep literal vì GitNexus có thể bỏ sót module.function(). Nếu HIGH/CRITICAL,
báo trước. Làm TDD, patch nhỏ, tái sử dụng component/storage hiện có, không thay schema
hoặc live DB nếu chưa được duyệt. Sau sửa chạy focused test, regression phù hợp và
detect_changes. Báo rõ phần đã kiểm chứng, phần chưa kiểm chứng và các file đã đụng.

Nhiệm vụ hiện tại của bạn là: <điền yêu cầu mới ở đây>.
```

---

## 8. Tiêu chuẩn một báo cáo hoàn tất tốt

Báo cáo cuối không chỉ nói “đã sửa”. Phải có:

- Nguyên nhân gốc.
- Nghiệp vụ sau sửa bằng một ví dụ dữ liệu cụ thể.
- Danh sách file/symbol đã đổi.
- Schema/migration có đổi hay không.
- Test nào chạy, kết quả số lượng rõ ràng.
- Test nào chưa chạy và lý do.
- Rủi ro còn lại.
- Không nhận công cho thay đổi của agent khác.

Nếu phát hiện code hiện tại khác tài liệu bàn giao, không âm thầm chọn một bên. Đọc live
schema/test và báo người dùng bằng bằng chứng cụ thể trước khi thay đổi nghiệp vụ.

