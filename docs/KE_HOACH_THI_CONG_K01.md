# K01 — Kế hoạch thi công

*2026-08-24. Nền: Nhóm A đã apply. **Không thêm migration nào ở phase này.***

## Luồng dữ liệu

```
①  Tiếp nhận              ②  K01 phân loại            ③  Nộp checklist       ④  Sếp duyệt
   ────────────              ──────────────              ─────────────         ─────────
   POST .../source-          Kéo tệp từ kho nguồn        Nút sáng khi ô bắt     Duyệt hết mục
   documents                 vào ô giấy trong sổ         buộc CỦA HẠNG MỤC      ⇒ auto-finalize
                                                          NÀY đã có link         đóng K01, mở K02
   tệp vào kho nguồn         → dossier_document_links
   của HỢP ĐỒNG              → ô tự nhảy "Đã nhận"

   chưa biết là giấy gì      MỘT tệp → NHIỀU ô           chặn ở
   slot_id = null            (nhiều hạng mục)            _authorized_checklist_
                             KHÔNG copy object            for_submission
```

Ba mốc, ba bảng, không chồng chéo: `dossier_documents` giữ **tệp**,
`dossier_document_links` giữ **phân loại**, `dossier_document_slots` giữ **yêu cầu của
thủ tục**.

### Kho là của HỢP ĐỒNG, K01 là của HẠNG MỤC

Hai tầng khác nhau, đừng lẫn: tệp nằm chung ở kho hợp đồng, nhưng **K01 chạy riêng cho
từng hạng mục** và mỗi hạng mục đòi một bộ giấy khác nhau. Đọc
`open_service_line_register` thì thấy rõ nguồn của sự khác nhau đó:

- `open_contract_register` đổ ô `KHACH_HANG` **dùng chung** (`task_type_id is null`).
- `open_service_line_register` đổ thêm `t.task_type_id = <thủ tục của hạng mục>` — và
  nhánh này lấy **mọi source, kể cả `KHACH_HANG`**. Chính chú thích trong mã đã nêu ví
  dụ: *Hoàn công cần Giấy phép xây dựng — chỉ thủ tục này mới đòi.*

Nên **bộ giấy bắt buộc của K01 cho một hạng mục** =

> ô `scope='CONTRACT'` bắt buộc (dùng chung)
> **+** ô `scope='SERVICE_LINE'` của **đúng hạng mục đó**, `source='KHACH_HANG'`, bắt buộc

Hợp đồng ba hạng mục ⇒ ba bộ khác nhau, ba lần K01, ba kết quả `can_submit` khác nhau.

## Backend

### Endpoint thêm mới (3)

| Method | Đường dẫn | Việc |
|---|---|---|
| `POST` | `/api/document-register/slots/{slot_id}/links` | Nối một tệp nguồn vào ô. Body `{document_id}` |
| `DELETE` | `/api/document-register/slots/{slot_id}/links/{document_id}` | Gỡ nối — `link_status='DA_GO'`, **không xoá dòng** |
| `GET` | `/api/document-register/service-lines/{service_line_id}/k01-status` | Tình trạng phân loại **của một hạng mục** |

Đường dẫn neo ở `service_line_id`, **không** ở `contract_id`. Hợp đồng ba hạng mục mà trả
một con số chung thì con số đó không trả lời được câu nào. `service_line_id` cũng không
chứa dấu `/` nên không cần `:path` như `contract_id`.

`k01-status` trả về — **tách rõ cái chặn khỏi cái chỉ nhắc**:

```json
{ "service_line_id": "SL-A", "contract_id": "003/BK-2026",
  "can_submit": false,

  "blockers": {
    "required_missing": ["Sổ đỏ gốc", "Giấy uỷ quyền"],
    "required_using_superseded": [
      {"slot_id": "...", "slot_name": "CCCD chủ đất", "document_id": "...", "revision_no": 1}
    ]
  },

  "warnings": {
    "unclassified": 2,
    "optional_missing": ["Bản vẽ cũ (nếu có)"],
    "superseded_in_use": [{"slot_id": "...", "slot_name": "...", "document_id": "..."}]
  },

  "counts": { "total_source_docs": 7, "linked_docs": 5, "total_links": 9,
              "required_total": 6, "required_done": 4 } }
```

`can_submit = (không có blocker nào)`. `warnings` **không bao giờ** ảnh hưởng tới
`can_submit`.

`total_links` (9) lớn hơn `linked_docs` (5) chính là bằng chứng một tệp dùng cho nhiều
hạng mục — con số đó phải hiện ra, không giấu đi.

### Điều kiện `can_submit` — chỉ ba thứ chặn

| Chặn | Vì sao |
|---|---|
| Ô **bắt buộc của hạng mục này** chưa có link đang dùng | Thiếu giấy thật thì nghiệm thu là chốt hồ sơ dở dang |
| Ô bắt buộc đang dùng tài liệu `DA_THAY_THE` | Đã biết có bản mới mà vẫn nghiệm thu bản cũ là cố tình sai |
| Điều kiện checklist sẵn có của bước | Không đụng tới, giữ nguyên |

**`unclassified` KHÔNG chặn.** Kho là của cả hợp đồng: một tệp chưa phân loại có thể
thuộc hạng mục khác, hoặc chỉ là tài liệu tham khảo khách gửi kèm. Bắt `unclassified = 0`
mới cho nộp là làm nhân viên hạng mục A kẹt vì một tờ giấy của hạng mục B. Nó chỉ là con
số cảnh báo, hiện trên UI, không khoá nút.

Tương tự, ô **không** bắt buộc còn trống cũng chỉ cảnh báo.

### Sửa (4 chỗ)

1. **`register._SLOTS_QUERY`** — mảng `files` hiện chỉ đọc `d.slot_id`. Đổi sang
   `union distinct` hai đường: link đang dùng, và `slot_id` (đường cũ, sổ thủ tục vẫn
   dùng). Thêm cờ `has_newer_revision` cho ô đang trỏ tài liệu `DA_THAY_THE`.
2. **`register.upload_source_document`** — khi có `slot_id` thì ghi **cả link** chứ không
   chỉ cột, để `attach_scan` của sổ gốc không bỏ sót đường mới.
3. **`routes_document_register.list_source_documents`** — `unclassified` đang đếm
   `slot_id is null`; đổi sang "không có link nào đang dùng". Trả kèm mảng `slots` mỗi
   tệp đang nằm trong.
4. **`EmployeePortalService._authorized_checklist_for_submission`** — hai lỗi trong cùng
   một câu truy vấn:
   - Nó đọc `slot.status = 'CHUA_CO'` — trạng thái gõ tay, quên đổi thì cổng mở oan.
     Đổi sang **không có link đang dùng**.
   - Nó `join dossier_document_slots on s.contract_id = sl.contract_id` **và chỉ lọc
     `s.scope = 'CONTRACT'`** — tức là bỏ sót ô `KHACH_HANG` riêng của thủ tục, và với
     phần dùng chung thì mọi hạng mục bị chặn/mở như nhau. Đổi sang đúng bộ của hạng mục
     (công thức ở trên), lấy `service_line_id` từ `workflow_instances`.

   Cổng dùng **đúng cùng một truy vấn** với `k01-status` — viết một hàm
   `k01_blockers(db, service_line_id)` rồi cả hai gọi. Hai bản sao của cùng một luật thì
   sớm muộn cũng lệch, và lệch ở đây nghĩa là nút sáng nhưng bấm vào báo lỗi.

### Hàm mới trong `register.py` (3)

`link_source_document(db, slot_id, document_id, *, actor_id)`,
`unlink_source_document(...)`, và `k01_blockers(db, service_line_id)` dùng chung cho cả
`k01-status` lẫn cổng nộp. Luật trong hàm:

- Ô phải có `source = 'KHACH_HANG'` — **không** phải `scope = 'CONTRACT'` như bản plan
  trước. Giấy khách đưa cũng có thể là ô riêng của thủ tục (Giấy phép xây dựng của Hoàn
  công); chặn theo `scope` là chặn nhầm đúng những ô đó. Ô `CONG_TY`/`CO_QUAN` thì từ
  chối — giấy công ty soạn không đến từ kho nguồn của khách.
- Nối lại sau khi gỡ là **UPDATE** dòng cũ về `DANG_DUNG` (unique cặp bắt buộc thế).
- Nối xong, ô đang `CHUA_CO` thì tự nhảy `DA_NHAN` — cùng khuôn với `attach_scan` tự
  nhảy `DA_SCAN`. Gỡ hết link thì **không** tự lùi trạng thái: giấy đã cầm trên tay thì
  gỡ phân loại không làm nó biến mất.
- Ghi `audit_log` với `object_id = document_id` (cột vừa thêm ở A3).
- Không đụng tới object trong kho. Đổi phân loại là đổi một dòng trong DB.

## Frontend

**`DocumentRegister.jsx`** — thêm khu "Kho hồ sơ khách gửi" phía trên danh sách ô, chỉ
hiện khi `inputOnly` (tức là đang ở trong K01):

- Danh sách tệp nguồn, mỗi dòng: tên tệp, người nạp, thời điểm, và **các ô nó đang nằm
  trong** (dạng chip). Tệp chưa phân loại có viền cảnh báo + đếm số ở tiêu đề khu.
- Mỗi tệp một nút gán → chọn ô từ danh sách ô của sổ. Chọn nhiều ô được, vì một tệp dùng
  cho nhiều hạng mục.
- Chip có nút gỡ.
- Ô đang trỏ tài liệu đã bị thay hiện nhãn **"Có bản mới hơn"** — chỉ nhãn, không nút tự
  đổi hàng loạt.
- Tên loại giấy lấy **từ `slot.name`**, không suy từ `object_key` hay tên thư mục.

**`EmployeeItemWorkspace.jsx`** — `DocumentRegister` đã gắn sẵn ở nhánh
`task.node_code === 'K01'`. Thêm: gọi `k01-status` **của `item.service_line_id`**, và khi
`can_submit = false` thì nút nộp checklist mờ kèm lý do lấy **từ `blockers`**:
*"thiếu: Sổ đỏ gốc, Giấy uỷ quyền"* hoặc *"CCCD chủ đất đang dùng bản cũ"*.

`warnings` hiện ở chỗ khác và **không được** làm mờ nút: số tệp chưa phân loại là một
dòng chữ nhỏ trong khu kho nguồn (*"2 tệp chưa phân loại — có thể thuộc hạng mục khác"*),
đúng nghĩa nhắc chứ không phải chặn.

## Test

**Backend (unit, mock db)**
1. Nối tệp vào ô — tạo dòng link, ô nhảy `DA_NHAN`.
2. Một tệp nối vào hai ô của hai hạng mục — hai dòng link, một object.
3. Gỡ nối — `link_status='DA_GO'` + `unlinked_at`, **không** xoá dòng.
4. Nối lại sau khi gỡ — UPDATE dòng cũ, không INSERT (đụng unique cặp).
5. Nối vào ô `source='CONG_TY'` → 409; nối vào ô `source='KHACH_HANG'` **scope
   `SERVICE_LINE`** (giấy riêng của thủ tục) → **thành công**.
6. `k01-status`: `unclassified` đếm theo link, không theo `slot_id`.
7. Cổng K01 chặn khi ô bắt buộc chưa có link, **kể cả khi `status` đã bị gõ tay thành
   `DA_NHAN`** — đây là ca chứng minh việc đổi nguồn sự thật.
8. Tài liệu `DA_THAY_THE` còn được dùng ⇒ có mặt trong `superseded_in_use`; hạng mục
   khác **không** tự đổi.

**Backend — hai điểm vừa chốt, mỗi điểm một test riêng**

9. **Hai hạng mục cùng hợp đồng cho hai kết quả khác nhau.** SL-A đủ giấy, SL-B thiếu ô
   `KHACH_HANG` riêng của thủ tục ⇒ `can_submit` true cho A, false cho B. Đây là ca mà
   endpoint neo ở contract sẽ trả lời sai.
10. **`unclassified > 0` nhưng mọi ô bắt buộc đã đủ ⇒ `can_submit = true`**, và số 2 nằm
    ở `warnings`, không ở `blockers`. Đây là ca nhân viên hạng mục A không được kẹt vì
    tờ giấy của hạng mục B.
11. Ô bắt buộc đang dùng tài liệu `DA_THAY_THE` ⇒ `can_submit = false`, tên ô nằm trong
    `blockers.required_using_superseded`.

**Frontend (vitest)**
12. Khu kho nguồn hiện đúng số tệp chưa phân loại — dạng **cảnh báo**, nút nộp vẫn sáng.
13. Bấm gán → gọi đúng endpoint, chip mới xuất hiện.
14. `can_submit=false` ⇒ nút nộp bị vô hiệu và hiện đúng lý do lấy từ `blockers`.

## Impact — GitNexus đối chiếu grep

| Symbol | GitNexus | grep | Dùng |
|---|---:|---:|---:|
| `get_register` | 0 | 1 | 1 |
| `upload_source_document` | — | 2 | 2 |
| `attach_scan` | 0 | 1 | 1 |
| `_SLOTS_QUERY` | — | 1 | 1 |
| `_authorized_checklist_for_submission` | 3 · LOW | 3 | 3 |

Rủi ro **LOW** toàn bộ. `_authorized_checklist_for_submission` là chỗ đáng chú ý nhất:
nó nằm trên luồng `submit_checklist_evidence`, sửa sai thì mọi bước nộp minh chứng —
không riêng K01 — đều hỏng. Điều kiện K01 phải nằm trong nhánh `node_code = 'K01'`, không
được rơi ra ngoài.

GitNexus vẫn báo 0 caller cho `get_register` và `attach_scan` (điểm mù `module.func()`);
số dùng là số của grep.

## Ngoài phạm vi phase này

Manifest, `document_supplement_requests`, và mọi migration Nhóm B. Phase này chỉ dựng
đúng dữ liệu để manifest sau này chụp lại được.
