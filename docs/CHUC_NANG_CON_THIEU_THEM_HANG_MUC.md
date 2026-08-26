# Chức năng còn thiếu: thêm Hạng mục vào hợp đồng đang tồn tại

**Trạng thái: CHƯA CÓ. Không nằm trong đợt EXPAND này.**

## Bằng chứng

Rà bằng GitNexus + grep ngày 26/8/2026:

| Nguồn | Kết quả |
|---|---|
| ORM `ServiceLine(...)` | 2 vị trí — `contracts/services.py:281` (helper, 2 caller là `create_contract` và `generate_and_save_contract`), `routes_crm.py:182` (CRM chuyển lead) |
| `INSERT INTO service_lines` | 1 — `scripts/seed_test_data.sql:47`, không được code hay compose nào gọi |
| Clone/copy hợp đồng | không tồn tại |
| Frontend gọi API tạo Hạng mục | không có |
| Route nhận `{service_line_id}` | chỉ `activate` / `cancel` / `priority` / `open` — đều thao tác trên Hạng mục đã có |

Cả ba đường thật đều tạo Hạng mục **cùng lúc với hợp đồng**. Khách muốn mua thêm dịch vụ giữa chừng thì hệ thống không có đường nào.

**Không được báo nghiệp vụ Hợp đồng là hoàn chỉnh khi chức năng này chưa tồn tại.**

## Luồng nghiệp vụ cần dựng

```
Nhân viên đề xuất mua thêm dịch vụ
  → Giám đốc duyệt giá / phụ lục hợp đồng
  → điều kiện thương mại được duyệt XONG mới tạo service_line V2
  → chọn bộ giấy riêng cho Hạng mục mới
```

Thứ tự này quan trọng: tạo Hạng mục trước rồi mới bàn giá là mở đường cho Hạng mục
"mồ côi" không gắn với thoả thuận nào, và nhân viên đã bắt đầu làm thì rất khó rút lại.

## Ràng buộc khi làm

- Đi qua đúng factory chung `_create_initial_service_line` — ghi `document_register_version = 2`,
  materialize sổ giấy tờ trong **cùng transaction**, ghi audit
- Người tạo phải chọn bộ giấy cho Hạng mục mới; cho phép chọn 0 loại
- Hạng mục mới **không** được thừa hưởng quyết định miễn giấy của Hạng mục cũ —
  phiếu miễn neo theo `service_line_id`
- Bộ mẫu đổi giữa chừng không được làm đổi các Hạng mục đang chạy

## Việc phải làm

1. Bảng/luồng đề xuất mua thêm dịch vụ (giá, phụ lục, người duyệt)
2. Route tạo Hạng mục cho hợp đồng đang tồn tại, gate theo trạng thái duyệt thương mại
3. Màn chọn bộ giấy cho Hạng mục mới (dùng lại component của form soạn hợp đồng)
4. Test: Hạng mục thêm sau là V2 · không kế thừa miễn giấy · bộ giấy độc lập với Hạng mục cũ
