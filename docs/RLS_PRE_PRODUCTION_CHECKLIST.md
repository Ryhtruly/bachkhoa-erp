# RLS — việc phải làm trước khi lên production

*Khảo sát trên Supabase `ejklrwydjplwzztfuygj`, ngày 2026-08-24. Không sửa gì, không apply gì.*

## Kết luận một dòng

Dữ liệu hiện **an toàn**, nhưng **không phải nhờ RLS**. Nó an toàn nhờ `GRANT`: hai vai
`anon` và `authenticated` không có một quyền nào trên bất kỳ bảng nào của schema `public`.
RLS đang bật trên 16 bảng nhưng chưa hề có tác dụng — và cũng chưa hề gây hại.

## Số liệu

| Hạng mục | Số lượng |
|---|---:|
| Bảng trong schema `public` | 71 |
| Bảng RLS **bật**, có policy | 0 |
| Bảng RLS **bật**, **0 policy** | 16 |
| Bảng RLS **tắt** | 55 |
| Bảng mà `anon` SELECT được | **0** |
| Bảng mà `authenticated` SELECT được | **0** |

Vai kết nối của backend là `postgres.ejklrwydjplwzztfuygj`, có `rolbypassrls = true`.
Nghĩa là mọi câu lệnh của backend đi vòng qua RLS, dù bảng có bật hay không.

> **Đính chính.** Báo cáo khảo sát Giai đoạn 0 nói có **3** bảng RLS bật mà 0 policy
> (`task_nodes`, `workflow_instances`, `task_node_checklist_results`). Con số đúng là
> **16**. Danh sách đầy đủ ở dưới.

## 16 bảng đang RLS bật với 0 policy

`cashflow_transactions` · `employee_compensation_terms` · `employee_pay_adjustments` ·
`handover_debt_requests` · `service_packages` · `task_node_acceptances` ·
`task_node_assignments` · `task_node_checklist_assignments` · `task_node_checklist_results` ·
`task_node_events` · `task_nodes` · `work_item_rates` · `work_items` ·
`work_pay_entitlements` · `workflow_instance_revisions` · `workflow_instances`

Đọc đúng nghĩa: RLS bật + 0 policy = **cấm tất cả** với mọi vai không bypass. Backend
bypass nên không thấy gì khác lạ. Đây là một quả mìn nằm im, không phải một lỗ hổng.

## Vì sao hiện chưa hở

Ba lớp phải hỏng cùng lúc thì mới có chuyện:

1. `anon`/`authenticated` không có `GRANT` nào → PostgREST (`/rest/v1/`) trả
   *permission denied* trước khi RLS kịp được hỏi tới.
2. Frontend **không** dùng `@supabase/supabase-js` — không có thư viện, không có import,
   không có key nào rời khỏi máy chủ. Toàn bộ dữ liệu đi qua REST API của backend.
3. `SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY` nằm trong `dev/backend/.env`
   nhưng **không được tham chiếu ở bất kỳ đâu trong mã nguồn**. Đó là cấu hình chết.
   `.env` đã nằm trong `.gitignore`, chưa từng bị commit.

## Bốn điều kiện kích hoạt — gặp bất kỳ điều nào thì phải viết policy trước

| # | Điều kiện | Chuyện gì xảy ra nếu bỏ qua |
|---|---|---|
| 1 | Cấp `GRANT` cho `anon` hoặc `authenticated` trên schema `public` | **55 bảng RLS tắt lộ toàn bộ ra Internet** — hợp đồng, khách hàng, lương. Chỉ cần biết URL dự án và publishable key. |
| 2 | Frontend gọi thẳng Supabase (thêm `supabase-js`, hoặc dùng Supabase Auth) | Như trên, cộng thêm việc key nằm trong bundle của trình duyệt. |
| 3 | Backend đổi sang vai không bypass (ví dụ tạo vai riêng cho ứng dụng) | **16 bảng RLS bật hoá cấm tất cả** — workflow, chấm công, khoán chết đứng, lỗi rỗng chứ không báo lỗi rõ. |
| 4 | Bật Supabase Realtime, Storage RLS, hoặc Edge Function dùng key người dùng | Cả hai chiều trên, tuỳ chỗ. |

Điều kiện 1 và 3 nguy hiểm ở hai hướng **ngược nhau**: một cái làm lộ dữ liệu, một cái
làm sập ứng dụng. Đó là lý do không nên "bật RLS cho đủ bộ" hay "tắt RLS cho gọn" —
mỗi việc gây một loại hỏng khác nhau.

## Việc phải làm trước production

- [ ] **Quyết vai kết nối của backend.** Giữ vai owner bypass RLS, hay tạo vai riêng?
      Câu trả lời này quyết định toàn bộ phần còn lại. Giữ owner thì RLS mãi mãi là
      trang trí, và bảo mật nằm hết ở tầng backend — chấp nhận được, nhưng phải nói rõ
      là đã chọn thế, không để nó là chuyện vô tình.
- [ ] **Kiểm lại `GRANT` ngay trước ngày lên production**, không phải hôm nay:
      ```sql
      select c.relname, c.relrowsecurity,
             has_table_privilege('anon', c.oid, 'SELECT') as anon_doc_duoc
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and has_table_privilege('anon', c.oid, 'SELECT')
       order by 1;
      ```
      Phải trả về **0 dòng**. Trả về khác 0 là chặn phát hành.
- [ ] **Gỡ `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`** khỏi `.env` nếu đến lúc
      đó vẫn không mã nào dùng. Cấu hình chết là thứ người sau sẽ tưởng là đang chạy.
- [ ] **Nếu chọn vai không bypass**: viết policy cho đủ **16 bảng** trước, chạy full test
      dưới vai đó, rồi mới đổi chuỗi kết nối. Đổi trước viết sau là sập.
- [ ] **Rà lại danh sách 16 bảng** — Giai đoạn 1 thêm `dossier_document_links` (RLS mặc
      định tắt). Danh sách này sẽ cũ đi; chạy lại truy vấn ở trên để lấy bản mới.

## Vì sao chưa viết policy bây giờ

Viết policy khi backend đang bypass là viết code không ai chạy: không test được, không
biết đúng sai, và sáu tháng nữa người đọc sẽ tưởng nó đang bảo vệ cái gì đó. Policy phải
ra đời cùng lúc với vai không bypass, không sớm hơn.
