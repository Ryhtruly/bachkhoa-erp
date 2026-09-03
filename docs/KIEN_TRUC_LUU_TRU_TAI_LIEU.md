# Kiến trúc lưu trữ tài liệu

Ánh xạ giữa **khái niệm nghiệp vụ** và **tên thư mục thật** trên MinIO/R2, kèm lý
do của từng lựa chọn. Đọc file này trước khi định đổi tên thư mục hay thêm một
đường upload mới.

Nguồn sự thật của mọi object key: [`dev/backend/src/files/references.py`](../dev/backend/src/files/references.py).
Không nơi nào khác được tự ghép chuỗi đường dẫn.

---

## 1. Luật gốc

**Một hợp đồng = một tủ hồ sơ.** Mọi tệp của hợp đồng đều nằm dưới đúng một
nhánh `contracts/{contract_id}/`. Không có thư mục dùng chung giữa hai hợp đồng,
không có tệp nào nằm ngoài nhánh của hợp đồng nó thuộc về.

**Một tệp = một object, nằm yên suốt đời.** Object key khoá theo `document_id`
(hoặc `task_node_id`), **không** theo loại giấy, không theo giai đoạn. Phân loại
là một bản ghi trỏ tới object, không phải vị trí của object.

> Vì sao: phân loại là việc của K01 và có thể đổi — nhân viên xếp nhầm, hoặc
> Giám đốc đổi tên mục trong mẫu. Nếu đường dẫn mang tên loại giấy thì mỗi lần
> phân loại lại là file phải di chuyển. Mà `object_key` có ràng buộc UNIQUE và
> nghiệp vụ cấm copy object, nên "di chuyển" ở đây nghĩa là hỏng.

**Không PII trong object key.** Không tên khách, không CCCD, không số điện thoại.
Tên tệp gốc bị thay bằng `document-{id}.{ext}` — xem `_neutral_filename()`.

**Một bucket, phân tách bằng prefix.** Mọi key đều bắt đầu bằng `contracts/` để
chạy nguyên vẹn trên R2 production, nơi tất cả nằm chung một bucket private.

---

## 2. Bảng ánh xạ

| Khái niệm trong spec | Đường dẫn thật | Dựng bởi |
|---|---|---|
| `raw/` — kho nguyên bản khách gửi | `contracts/{hd}/source-documents/{document_id}/{ten}` | `ContractFileReference` |
| `hop-dong/` — file hợp đồng .docx | *cùng chỗ trên*, phân biệt bằng `contracts.file_link` | `ContractFileReference` |
| `nodes/` — minh chứng của từng bước | `contracts/{hd}/service-lines/{sl}/nodes/{task_node_id}/{ten}` | `FileReference` |
| giấy tờ hồ sơ (công ty soạn / cơ quan trả) | `contracts/{hd}/dossier-documents/{document_id}/{ten}` | `DossierFileReference` |

### Vì sao `hop-dong/` không có thư mục riêng

File hợp đồng đã ký đi qua đúng đường kho nguồn (`register.upload_source_document`)
chứ không có đường upload thứ hai. Nó đã kiểm định dạng, kiểm dung lượng, sinh key
không mang PII, và giữ luật một-tệp-một-object. `contracts.file_link` trỏ vào key
đó — đổi file hợp đồng là upload bản mới rồi trỏ lại, **bản cũ không bị xoá**, vẫn
nằm trong kho nguồn để đối chiếu.

Tách ra một thư mục `hop-dong/` riêng sẽ cần một đường upload thứ hai, tức là nhân
đôi bốn lớp kiểm tra trên.

### Vì sao minh chứng khoá theo `task_node_id`, còn giấy tờ hồ sơ khoá theo `document_id`

Hai loại tệp trả lời hai câu hỏi khác nhau:

- **Minh chứng** trả lời *"lúc làm bước này đã chụp được gì"* — nó gắn chặt vào
  một lần chạy bước. Bước chạy lại (rollback) sinh `task_node_id` khác, và đó là
  đúng: ảnh của lần đo trước không được lẫn với lần đo sau.
- **Giấy tờ hồ sơ** trả lời *"tờ giấy này ở đâu"* — nó sống lâu hơn mọi bước, và
  có thể được nộp lại nhiều lần.

---

## 3. Giai đoạn hồ sơ (`DOSSIER_STAGES`)

Giấy tờ Hồ sơ pháp lý được **xếp theo giai đoạn**, không theo `task_node`. Đây là
cách *hiển thị*, không phải cách lưu — object vẫn nằm ở
`dossier-documents/{document_id}/`.

```
ho-so-goc
do-hien-truong          K02 — tài liệu THÔ tại hiện trường
chuan-hoa-ky-thuat      K03 — bản ĐÃ XỬ LÝ
soan-ho-so              K04
nop-noi-nghiep          K05a — nộp kỹ thuật trong công ty, chưa ra cơ quan
nop-co-quan             K05b (và K05 cũ) — biên nhận, giấy hẹn
ket-qua                 K06 — sổ đỏ, biên bản bàn giao
```

K02 và K03 tách làm hai giai đoạn có chủ đích: để chung thì sáu tháng sau đọc lại
hồ sơ không phân biệt được đâu là bản gốc, đâu là bản đã chuẩn hoá.

K05a và K05b cũng vậy — hai lần nộp khác hẳn nhau, hai phòng khác nhau làm, sinh
hai loại giấy khác nhau. Xem
[`20260831060000_tach_node_k05_va_truc_node.sql`](../supabase/migrations/20260831060000_tach_node_k05_va_truc_node.sql).

---

## 4. MinIO trông thế nào với 10 hợp đồng

```
contracts/
├── HD_001_BK_2026/
│   ├── source-documents/
│   │   ├── 7f3a…c1/document-7f3a…c1.pdf     ← khách gửi lúc tạo HĐ
│   │   ├── 9b21…4e/document-9b21…4e.jpg
│   │   └── e402…88/document-e402…88.docx    ← contracts.file_link trỏ vào đây
│   ├── dossier-documents/
│   │   ├── a115…20/document-a115…20.pdf
│   │   └── c8d9…07/document-c8d9…07.pdf
│   └── service-lines/
│       ├── SL-4471/nodes/TN-9902/evidence-…jpg
│       └── SL-4472/nodes/TN-9915/evidence-…jpg
├── HD_002_BK_2026/
│   └── …
└── HD_010_BK_2026/
    └── …
```

Mười hợp đồng là mười nhánh song song, không chạm nhau. Muốn bàn giao trọn bộ một
hợp đồng thì lấy đúng một prefix; muốn xoá thì xoá đúng một prefix. Không có
truy vấn nào phải lọc chéo giữa các hợp đồng để biết tệp nào của ai.

---

## 5. Bốn trục Master Data (không nằm ở MinIO)

Cấu hình *"hợp đồng nào cần những tờ gì"* nằm hoàn toàn dưới DB, không phản ánh
vào cấu trúc thư mục:

```
Gói → Hạng mục → Node → Loại giấy
```

- Trục Gói, Hạng mục, Node: `document_template_applicabilities`
  (`applicability_type` + `service_package_id` / `task_type_id` + `node_code`)
- Loại giấy: `document_checklist_templates` — kèm **nhóm nguồn gốc** (`source`:
  `KHACH_HANG` / `CONG_TY` / `CO_QUAN`), quyết định tờ giấy hiện ở ngăn nào của
  tủ hồ sơ.

Một dòng khai mẫu là bộ năm:
**[Tên giấy] + [Nhóm nguồn gốc] + [Gói] + [Hạng mục] + [Node]**.

Hai thông số đầu thuộc về chính loại giấy — "CCCD" thì gói nào cũng do khách cấp.
Ba thông số sau là phạm vi, và một loại giấy khai được nhiều phạm vi.

`node_code` để trống nghĩa là **chưa gán bước** — tờ giấy đó không hiện ở màn
nhân viên nào, tức là không ai thu. Màn *Mẫu Giấy Tờ* đếm số này ngay trên tiêu
đề để nó không im lặng trôi qua.

---

## 6. Việc không được làm

- **Không tự ghép đường dẫn.** Mọi key đi qua `references.py`.
- **Không viết đường upload thứ hai.** Tái sử dụng
  [`storage_service.py`](../dev/backend/src/services/storage_service.py).
- **Không đổi tên thư mục đã có.** `object_key` là UNIQUE và đã có dữ liệu thật;
  đổi tên nghĩa là di chuyển object, trái luật một-tệp-một-object.
- **Không đưa loại giấy / giai đoạn / PII vào object key.**
