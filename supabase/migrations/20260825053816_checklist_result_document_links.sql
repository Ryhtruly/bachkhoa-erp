-- Bảng nối "kết quả checklist ↔ tài liệu": nhiều-nhiều.
--
-- Vì sao không phải một cột dossier_documents.checklist_result_id: một checklist
-- đòi nhiều tài liệu (K02 cần ảnh hiện trạng VÀ toạ độ GPS VÀ bản kỹ thuật gốc),
-- và một tài liệu phục vụ nhiều checklist ở nhiều Node (K03 dùng lại bản kỹ
-- thuật gốc của K02). Một cột chỉ chứa được một giá trị nên sai cả hai chiều.
--
-- Không bảng nào trong hệ thống làm việc này: dossier_document_links là
-- tài liệu × Ô GIẤY (phân loại); task_node_checklist_assignments là
-- checklist × NHÂN VIÊN (khoán). Khác nghĩa hoàn toàn.
--
-- Object trên kho lưu trữ KHÔNG bị nhân bản: đây chỉ là quan hệ trỏ tới tệp.
-- Yêu cầu: chạy sau 20260825085000_checklist_results_contract_id.sql.

create table if not exists public.checklist_result_document_links (
  id varchar primary key default gen_random_uuid()::text,

  -- Cột bản lề: CẢ HAI khoá ngoại ghép bên dưới cùng dùng nó, nên một dòng chỉ
  -- tồn tại được khi checklist VÀ tài liệu cùng thuộc đúng hợp đồng này.
  contract_id varchar not null references public.contracts(id) on delete restrict,

  checklist_result_id varchar not null,
  document_id varchar not null,

  created_by varchar references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Một tài liệu nối vào một checklist đúng một lần. Chỉ mục này đã có
-- checklist_result_id ở vị trí đầu nên KHÔNG tạo thêm index riêng cho cột đó —
-- sẽ trùng chức năng.
create unique index if not exists uq_checklist_result_document_pair
  on public.checklist_result_document_links (checklist_result_id, document_id);

-- Chiều ngược lại thì cần chỉ mục riêng: "tài liệu này đang được checklist nào dùng".
create index if not exists checklist_result_document_links_document_idx
  on public.checklist_result_document_links (document_id);

-- ── Chốt chặn nối chéo Hợp đồng — hai phía, bằng cấu trúc ───────────────────
--
-- Chỉ ràng buộc phía tài liệu là chưa đủ: nó mới chứng minh TÀI LIỆU thuộc hợp
-- đồng nào, chưa nói gì về CHECKLIST. Phải ghép cả hai phía vào cùng cột
-- contract_id thì mới chặn được "checklist HĐ004 nối tài liệu HĐ003".
--
-- checklist đi thì quan hệ vô nghĩa → cascade.
-- tài liệu thì không được biến mất khi còn ai trỏ tới → restrict.
alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_checklist_fk;
alter table public.checklist_result_document_links
  add constraint checklist_result_document_links_checklist_fk
  foreign key (checklist_result_id, contract_id)
  references public.task_node_checklist_results (id, contract_id) on delete cascade;

alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_document_fk;
alter table public.checklist_result_document_links
  add constraint checklist_result_document_links_document_fk
  foreign key (document_id, contract_id)
  references public.dossier_documents (id, contract_id) on delete restrict;

-- Bảng mới trong public: bật RLS cho đồng bộ với các bảng nghiệp vụ khác.
-- KHÔNG cấp GRANT cho anon/authenticated, KHÔNG viết policy ở đây — backend
-- dùng vai bypass RLS. Xem docs/RLS_PRE_PRODUCTION_CHECKLIST.md.
alter table public.checklist_result_document_links enable row level security;

comment on table public.checklist_result_document_links is
  'Tài liệu đầu ra nhân viên nộp tại một checklist. Tệp lưu MỘT lần ở dossier_documents; bảng này chỉ là quan hệ.';
