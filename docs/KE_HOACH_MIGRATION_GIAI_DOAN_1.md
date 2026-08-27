# Giai đoạn 1 — Migration: SQL, mô phỏng, phương án lùi

*2026-08-24.*

> **Trạng thái: Nhóm A đã apply lên Supabase** (`ejklrwydjplwzztfuygj`) sau khi được duyệt.
> Ba version trong registry: `source_document_columns`, `dossier_document_links`,
> `audit_log_object_id`. Kiểm chứng trên chính DB thật: nối hợp lệ chạy, chặn trùng cặp,
> chặn nối chéo hợp đồng, chặn khai gian `contract_id`, chặn xoá ô còn nối — cả 5 đúng,
> chạy trong khối tự huỷ nên không để lại dòng nào.
> Test sau apply: backend **237 passed / 11 lỗi có sẵn**, frontend **79 passed**.
>
> **Nhóm B vẫn chưa apply.**

*Toàn bộ đã diễn tập trước trên Postgres cục bộ (`bachkhoa-pg-test`, database `rehearse_a`).*

---

## Nhóm A — sẵn sàng apply

Ba file trong `supabase/migrations/`, ba file lùi tương ứng trong `supabase/rollback/`.

### A1 · `20260824110000_source_document_columns.sql`

Thêm 4 cột vào `dossier_documents`:

| Cột | Kiểu | Null | Default |
|---|---|---|---|
| `checksum_sha256` | `varchar(64)` | có | — |
| `revision_no` | `integer` | không | `1` |
| `supersedes_id` | `varchar` → tự trỏ `dossier_documents(id)` `on delete set null` | có | — |
| `doc_status` | `varchar` | không | `'DANG_DUNG'` |

`doc_status` nhận đúng 4 giá trị: `DANG_DUNG` · `DA_THAY_THE` (có bản mới) ·
`KHONG_HOP_LE` (mờ, sai giấy) · `DA_GO` (gỡ khỏi hồ sơ, vẫn giữ tệp).

**Chỉ mục** (đúng yêu cầu "index nếu query theo `checksum_sha256`, `doc_status`"):

- `dossier_documents_checksum_idx (contract_id, checksum_sha256)` — partial, bỏ qua null.
- `dossier_documents_contract_status_idx (contract_id, doc_status, uploaded_at desc)`.
- `uq_dossier_documents_supersedes (supersedes_id)` — **unique**, partial.

**Một quyết định cần bạn biết:** checksum **không** unique. Khách đưa lại đúng tờ đã có
là chuyện thật (bản scan lần hai rõ hơn) — unique sẽ chặn đúng thao tác hợp lệ đó. Trùng
checksum thì cảnh báo ở tầng ứng dụng, không chặn ở tầng DB.

Ngược lại `supersedes_id` **có** unique: một bản chỉ được đúng một bản kế thay nó. Cho
rẽ nhánh thì câu "bản mới nhất của tờ này là bản nào" hết có câu trả lời.

**Dữ liệu cũ:** `dossier_documents` đang có **0 dòng**. Không có backfill, không có rủi ro
dữ liệu cũ. Mọi cột vẫn để default an toàn để lần chạy sau trên môi trường có dữ liệu
cũng không hỏng.

### A2 · `20260824111000_dossier_document_links.sql`

Bảng nối `dossier_document_links`, theo đúng ba yêu cầu bạn nêu:

- **Unique `(document_id, slot_id)`** ✓ — `uq_dossier_document_links_pair`.
- **FK rõ ràng** ✓ — nhưng là **khoá ngoại ghép**, xem phần B6 bên dưới.
- **Không cascade nguy hiểm** ✓ — `on delete restrict` cả hai phía, cộng soft-state
  `link_status` (`DANG_DUNG` / `DA_GO`) để "gỡ nối" là một hành vi có ghi nhận, không
  phải một dòng biến mất.

Nối lại sau khi gỡ là **UPDATE** dòng cũ về `DANG_DUNG`, không phải INSERT dòng mới —
đó là hệ quả của unique trên cặp. Lịch sử nối/gỡ nhiều lần nằm ở `audit_log`.

Cột `dossier_documents.slot_id` cũ **không bị xoá**. Giai đoạn 1 ghi cả hai, chạy ổn rồi
mới bỏ ở migration sau.

### A3 · `20260824112000_audit_log_object_id.sql`

`alter table public.audit_log add column if not exists object_id varchar;` — nullable,
không default. Cộng một chỉ mục partial `(object_type, object_id, created_at desc)`.
442 dòng cũ giữ nguyên, `object_id` null.

*Ghi chú ngoài lề, không xử lý trong migration này:* `audit_log.created_at` là
`timestamp without time zone`, lệch với phần còn lại của hệ thống vốn dùng `timestamptz`.

---

## Kết quả diễn tập Nhóm A

Dựng lại đúng hình dạng thật của `contracts` / `service_lines` / `dossier_document_slots` /
`dossier_documents` / `audit_log` (lấy từ `information_schema` của Supabase), rồi chạy.

**Chín tình huống phải-lỗi, cả chín đều lỗi đúng chỗ:**

| # | Tình huống | Bị chặn bởi |
|---|---|---|
| 2 | Nối tệp của HĐ 003 vào ô giấy của HĐ 004 | `dossier_document_links_slot_fk` |
| 3 | Khai gian `contract_id` để lách | `dossier_document_links_document_fk` |
| 4 | Nối trùng cặp (tệp, ô) | `uq_dossier_document_links_pair` |
| 5 | Đánh dấu `DA_GO` mà không ghi thời điểm gỡ | `..._unlinked_check` |
| 6 | Xoá ô giấy đang có tệp nối vào | FK `restrict` |
| 7 | Xoá tệp đang được hồ sơ dùng | FK `restrict` |
| 9 | Bản thứ ba cũng đòi thay `D1` | `uq_dossier_documents_supersedes` |
| 10 | `doc_status = 'LUNG_TUNG'` | `..._doc_status_check` |

**Chạy đi chạy lại:** 3 lượt liên tiếp trên database đã có dữ liệu, sạch cả 3, dữ liệu
còn nguyên. *(Lượt đầu A2 chết — `drop constraint` không gỡ được ràng buộc đang có khoá
ngoại phụ thuộc. Đã sửa sang khối `DO … if not exists`.)*

**Lùi rồi tiến lại:** `down` theo thứ tự A2 → A1 → A3, rồi `up` lại cả ba. Sạch. Bản sao
lưu giữ đủ 4 dòng nối và 3 dòng cột mới.

---

## Phương án lùi từng migration

| Migration | Lùi được? | Mất gì | Ghi chú |
|---|---|---|---|
| A1 | Có | Nội dung 4 cột | Script tự tạo `dossier_documents_backup_20260824` trước khi xoá cột |
| A2 | Có | Toàn bộ kết quả phân loại | Script tự tạo `dossier_document_links_backup_20260824`. Tệp trong kho **không** mất |
| A3 | Có | `object_id` của nhật ký mới | Nhật ký cũ vốn null, không mất gì |

**Thứ tự bắt buộc khi lùi: A2 trước, A1 sau.** A3 độc lập.

---

## Hai thay đổi hành vi cần biết trước khi apply

Không phải lỗi, nhưng sẽ đổi cách hệ thống cư xử — nói trước để không bị bất ngờ:

1. **Xoá hợp đồng sẽ bị chặn** khi hợp đồng đó đã có dòng nối. Chuỗi hiện tại là:
   xoá hợp đồng → cascade xoá ô giấy → nhưng `dossier_document_links` giữ `restrict` nên
   chặn lại. Muốn xoá dữ liệu test thì phải `delete from dossier_document_links` trước.
   Đây là hệ quả cố ý của "không cascade nguy hiểm", nhưng bạn đang hay xoá data test
   nên cần biết.

2. ~~**`remove_slot` phải sửa code cùng lượt.**~~ **Đã sửa.** Hàm ở
   [register.py](../dev/backend/src/dossiers/register.py) nay đếm cả hai đường: tệp gắn
   thẳng qua `dossier_documents.slot_id`, và mối nối còn hiệu lực trong
   `dossier_document_links`. Còn nối thì báo *"đang nhận N tài liệu từ kho nguồn"* (409),
   không để lệnh xoá đâm vào khoá ngoại `restrict` rồi vỡ thành 500 thô.

---

## Nhóm B — mô phỏng và đề xuất

### B4 · Manifest khác gì bảng nối?

Bạn yêu cầu chứng minh không trùng trách nhiệm. Đây là chứng minh, chạy thật:

**Bối cảnh.** Hợp đồng `003/BK-2026`, hai hạng mục `SL-A` (tách thửa) và `SL-B` (cấp đổi).
Ba tệp nguồn: `D1` CCCD, `D2` sổ đỏ. CCCD dùng cho **cả hai** hạng mục.

Sau khi K01 phân loại — một tệp, hai ô giấy, **không nhân bản tệp**:

```
 document_id | so_o_giay
-------------+-----------
 D1          |         2      ← CCCD nằm trong hồ sơ của cả SL-A lẫn SL-B
 D2          |         1
```

**Rồi khách đưa lại bản CCCD rõ hơn.** Nạp `D4` (`revision_no=2`, `supersedes_id=D1`),
`D1` chuyển `DA_THAY_THE`, gỡ nối `(D1, S-A-cccd)` và nối `(D4, S-A-cccd)`:

```
 service_line_id |    o_giay    | document_id | revision_no | doc_status
-----------------+--------------+-------------+-------------+-------------
 SL-A            | CCCD chủ đất | D4          |           2 | DANG_DUNG
 SL-A            | Sổ đỏ gốc    | D2          |           1 | DANG_DUNG
 SL-B            | CCCD chủ đất | D1          |           1 | DA_THAY_THE
```

**Đây là chỗ khác nhau.** Bảng nối bây giờ nói SL-A dùng `D4`. Nó **không còn** nói được
rằng lúc Giám đốc duyệt K01 cho SL-A, bộ hồ sơ ấy gồm `D1`. Thông tin đó đã bị ghi đè —
bảng nối là **hiện trạng**, và hiện trạng thì luôn là cái mới nhất.

Manifest là **ảnh chụp đông cứng tại thời điểm nghiệm thu**, không bao giờ UPDATE, chỉ
INSERT thêm revision:

```
service_line_id = SL-A, revision_no = 1, status = 'published'
approved_by = GD, approved_at = 2026-08-24 09:12
snapshot = [
  {slot: 'S-A-cccd', name: 'CCCD chủ đất', document_id: 'D1',
   file_name: 'cccd.pdf', checksum: 'ab…ab', revision_no: 1,
   copy_type: 'BAN_SAO', quantity: 2},
  {slot: 'S-A-sodo', name: 'Sổ đỏ gốc',    document_id: 'D2', …}
]
```

Bổ sung giấy sau đó ⇒ `revision_no = 2` mới, revision 1 chuyển `superseded`. Cả hai cùng
đọc lại được.

**Ranh giới trách nhiệm, phát biểu thành luật:**

| Câu hỏi | Trả lời bằng |
|---|---|
| "Hồ sơ hạng mục này **hiện có** những gì?" | `dossier_document_links` — và chỉ bảng này |
| "Lúc sếp duyệt K01 ngày 24/08 thì bộ hồ sơ gồm những gì?" | manifest revision 1 — và chỉ manifest |

Không đọc chéo. Manifest không bao giờ được dùng để trả lời câu đầu; bảng nối không bao
giờ trả lời được câu sau. Thêm một luật giữ cho nó không trôi: **manifest chỉ INSERT,
không UPDATE.**

*Suy ra từ audit_log được không?* Về lý thì có, bằng cách phát lại sự kiện. Nhưng
`payload_json` là text không truy vấn được, và chỉ cần một lần ghi nhật ký sót là sự thật
mất luôn. Ảnh chụp đọc trong một lần truy vấn và không thể trôi.

### Quy tắc khi tệp nguồn có bản mới — **đã chốt: thủ công từng hạng mục**

Ở kết quả trên, **SL-B vẫn đang trỏ bản cũ `D1`** dù `D1` đã bị thay. Đó là hành vi đúng,
không phải thiếu sót. Lý do: mỗi hạng mục nghiệm thu K01 ở thời điểm khác nhau, và hạng
mục đã nộp cơ quan thì không được âm thầm đổi giấy dưới chân.

Luật để code K01 bám theo:

1. Tệp nguồn có revision mới ⇒ hạng mục đang dùng bản cũ **giữ nguyên bản cũ**.
2. Sổ giấy tờ hiện cảnh báo **"Có bản mới hơn"** trên mọi ô đang trỏ tài liệu
   `DA_THAY_THE`. Truy vấn đếm đã có sẵn, mô phỏng trả về đúng 1 ô cần xem lại.
3. Đổi sang bản mới là **thao tác tay, từng hạng mục**, chỉ người có quyền mới bấm.
4. Hạng mục đã có manifest `published` (K01 đã nghiệm thu) thì đổi phải **tạo revision
   mới + ghi audit**, không sửa đè lên ảnh chụp cũ.

### B5 · `document_supplement_requests`

**Enum `request_type`** đúng như bạn chốt: `INTERNAL_CORRECTION` · `CUSTOMER_SUPPLEMENT`.

**Nhưng có một chuyện phải báo:** `INTERNAL_CORRECTION` **đã được xây rồi**. Bảng
`document_slot_change_requests` (migration `20260824095000`, đang chạy) làm đúng việc đó:
`slot_id` + `reason` + `pending/approved/rejected` + `unlocked_until` 24 giờ + unique
"mỗi ô một phiếu chờ". Hàm `request_slot_change` / `review_slot_change` đã hoạt động.

Dựng thêm một bảng nữa cho cùng nghiệp vụ là có hai chỗ cùng nói một chuyện.

**Đề xuất:** Giai đoạn 1 chỉ ghi `CUSTOMER_SUPPLEMENT` vào bảng mới; `INTERNAL_CORRECTION`
ở nguyên chỗ cũ. Vẫn giữ cột `request_type` như bạn yêu cầu, và **khoá nghĩa bằng một
CHECK ghép** để DB tự từ chối tổ hợp vô nghĩa — đúng tinh thần "không được trộn nghĩa mơ hồ":

```sql
constraint document_supplement_requests_status_check check (
  (request_type = 'CUSTOMER_SUPPLEMENT'
     and status in ('draft', 'requested', 'received', 'resolved', 'cancelled'))
  or
  (request_type = 'INTERNAL_CORRECTION'
     and status in ('pending', 'approved', 'rejected', 'resolved', 'cancelled'))
)
```

Hai vòng đời **thật sự khác nhau**, đó là lý do không nên ép chung một enum:

```
CUSTOMER_SUPPLEMENT   draft → requested → received → resolved
                                   ↓          ↓
                               cancelled  cancelled
   requested = đã báo khách   ·   received = khách đưa giấy, gắn document_id
   resolved  = nhân viên xác nhận đủ   ·   KHÔNG có người duyệt

INTERNAL_CORRECTION   pending → approved → resolved
                          ↓         (mở khoá ô giấy 24 giờ)
                       rejected
   Có người duyệt (Giám đốc), có nhánh từ chối, có cửa sổ thời gian
```

Ép chung thì mỗi trạng thái phải kèm chú thích "chỉ dùng cho loại X" — đúng thứ mơ hồ
cần tránh.

**Phiếu gắn vào đâu** (bạn hỏi contract / service_line / slot / document):

| Cột | Bắt buộc | Vì sao |
|---|---|---|
| `contract_id` | **có** | Giấy là của khách, khách thuộc hợp đồng. Đây là người mình gọi điện. |
| `service_line_id` | không | Đặt khi tờ giấy chỉ một hạng mục cần |
| `slot_id` | không | Đặt khi đã biết chính xác ô nào trống |
| `document_id` | không | Điền lúc `received` — tệp khách vừa đưa |
| `requested_name` | **có** | Tên tờ giấy cần xin. Lúc tạo phiếu có thể **chưa có ô nào** cho nó |

Neo ở `contract_id` vì ba cột kia đều có thể chưa biết lúc tạo phiếu — "thiếu giấy khai
sinh" là câu nói được trước khi có ai lập ô cho nó. Dùng lại khoá ngoại ghép như A2 để
phiếu không trỏ nhầm sang ô của hợp đồng khác.

### B6 · Chốt chặn nối chéo hợp đồng — **đề xuất bỏ migration này**

Bạn lo đúng: "trigger sai có thể chặn nhầm thao tác hợp lệ". Nên tôi không viết trigger.

A2 đã chặn rồi, **bằng cấu trúc**. Bảng nối mang `contract_id`, và hai khoá ngoại ghép
dùng **chung** cột đó:

```sql
foreign key (document_id, contract_id) references dossier_documents (id, contract_id)
foreign key (slot_id,     contract_id) references dossier_document_slots (id, contract_id)
```

Một dòng chỉ tồn tại được khi **cả tệp lẫn ô giấy cùng thuộc đúng hợp đồng đó**. Lệch một
cái là Postgres từ chối. Không có mã nào để viết sai, không lách được kể cả khi INSERT
thẳng vào DB.

Đã thử cả hai đường lách trong diễn tập:

- Nối tệp HĐ 003 vào ô HĐ 004 → chặn bởi `..._slot_fk`.
- Khai `contract_id = 004` cho khớp ô, hòng lách → chặn bởi `..._document_fk`.

Giá phải trả: hai chỉ mục unique ghép trên bảng cha, trùng nghĩa với khoá chính. Rẻ hơn
một trigger nhiều.

**Vậy 6 migration còn 5** — và cái bạn e ngại nhất không còn tồn tại.

---

## Trạng thái môi trường — một điều cần nói rõ

Bạn yêu cầu "chạy test sau migration trên dev/staging trước, chưa live production".

**Hiện chỉ có MỘT project Supabase** (`ejklrwydjplwzztfuygj`). Nó vừa là dev vừa là nơi
chứa dữ liệu thật đang test — 3 hợp đồng, 3 hạng mục, 16 ô giấy, 31 mẫu, 0 tệp. Không có
staging riêng. Nói cách khác, "apply lên dev" và "apply lên live" hiện là **cùng một
database**.

Nên đường đi an toàn nhất trong tay là:

1. Diễn tập trên `bachkhoa-pg-test` cục bộ — **đã xong, kết quả ở trên**.
2. Apply lên Supabase khi bạn duyệt.
3. Chạy lại full test (backend + frontend) ngay sau đó.
4. Nếu hỏng: chạy 3 script lùi, đã thử up→down→up.

Nếu bạn muốn một staging thật trước khi production, Supabase có branching — tạo nhánh
database riêng. Đó là một quyết định hạ tầng, tôi chưa động vào.
