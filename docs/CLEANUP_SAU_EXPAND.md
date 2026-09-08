# Dọn dẹp sau đợt EXPAND

Ghi lại để không quên. **Không** phải chờ tới đợt CONTRACT — cột đã tồn tại ngay
sau EXPAND, nên các việc dưới đây làm được ngay sau khi smoke test đạt.

## 1. Map lại `document_register_version` vào ORM

Hiện cột **cố ý không** được map trong `dev/backend/src/db/models/crm.py`.

Lý do tạm thời: map vào model thì mọi truy vấn ORM trên `ServiceLine` đều
`SELECT` cột đó — danh sách hợp đồng, cache, báo cáo — nên chỉ cần CSDL chưa có
cột là toàn bộ gãy 500. Đã xảy ra thật một lần trên dev.

Sau EXPAND + smoke test đạt, trong một lần deploy tương thích:

```python
document_register_version = Column(Integer, nullable=False, default=1)
```

Giữ `default=1` cho tới khi đợt CONTRACT đổi default CSDL sang 2. Mã nguồn vẫn
phải ghi 2 **tường minh** ở mọi đường tạo Hạng mục — default chỉ là lưới an toàn.

## 2. Bỏ các SQL thuần chỉ tồn tại để né schema cũ

Sau khi map lại ORM, hai chỗ này viết bằng SQL thuần có thể quay về ORM:

- `contracts/services.py` — `update public.service_lines set document_register_version = 2`
- `routes/routes_crm.py` — cùng câu lệnh

**Giữ nguyên** `require_v2_schema()` và `reset_schema_cache()`: chúng không phải
mã tạm. Cổng 503 vẫn cần cho trường hợp deploy lệch nhịp trong tương lai.

## 3. Không gỡ vội phần dò schema

`_co_cot_register_version` / `_co_cot_waiver_service_line` vẫn có ích khi rollback
hoặc khi dựng môi trường mới từ migration cũ. Chỉ gỡ khi chắc chắn mọi môi
trường đã ở schema mới.

## Việc riêng, KHÔNG thuộc đợt này

- Đợt CONTRACT: `SET NOT NULL` cho `service_line_id` của phiếu WAIVE, đổi default
  `document_register_version` sang 2 — xem `supabase/pending/`
- Chức năng thêm Hạng mục vào hợp đồng đang tồn tại — xem
  `docs/CHUC_NANG_CON_THIEU_THEM_HANG_MUC.md`
