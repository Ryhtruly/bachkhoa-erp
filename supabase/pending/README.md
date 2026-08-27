# Migration CHỜ DUYỆT — không nằm trong hàng đợi apply

Thư mục này **không phải** `supabase/migrations`. Công cụ apply "toàn bộ migration
pending" không nhìn tới đây, nên không thể chạy nhầm.

## Vì sao có thư mục này

`M0b` (`SET NOT NULL` cho `task_node_checklist_results.contract_id`) là bước
CONTRACT của mô hình expand–contract. Nó **chỉ được chạy sau khi**:

1. đợt EXPAND đã lên (M0a → M1 → M2 → D);
2. backend + frontend mới đã deploy và đang ghi `contract_id` cho mọi dòng mới;
3. smoke test trên dữ liệu thật đã qua;
4. người dùng duyệt riêng.

Để nó trong `supabase/migrations` với timestamp `20260825093000` là mời tai hoạ:
timestamp đó **nhỏ hơn** migration D (`20260825094000`), nên một lệnh apply hàng
loạt sẽ chạy `SET NOT NULL` **ngay giữa đợt EXPAND**, trước cả khi mã mới lên —
và mọi lệnh tạo Node sẽ hỏng.

## Khi được duyệt thì làm gì

Chép file `..._contract.sql` trở lại `supabase/migrations/` với **timestamp mới,
lớn hơn version cuối trên live** — hiện là `20260825063758_audit_log_id_sequence`,
nên dùng `20260826xxxxxx_..._contract.sql`, rồi apply.
Bản lùi chép về `supabase/rollback/` cùng timestamp.
